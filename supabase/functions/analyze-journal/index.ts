import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entry_text, journal_id } = await req.json();
    const HF_TOKEN = Deno.env.get("HUGGING_FACE_ACCESS_TOKEN");

    console.log("Analyzing journal entry:", journal_id);

    // Analyze with Hugging Face if token is configured; otherwise fallback
    let sentiment: any = { label: "NEUTRAL", score: 0 };
    let emotions: any[] = [{ label: "neutral", score: 1 }];

    if (HF_TOKEN) {
      try {
        // Analyze sentiment
        const sentimentResponse = await fetch(
          "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${HF_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: entry_text,
              parameters: { return_all_scores: true },
              options: { wait_for_model: true },
            }),
          }
        );

        if (sentimentResponse.ok) {
          const sentimentData = await sentimentResponse.json();
          sentiment = normalizeSentimentResponse(sentimentData) ?? sentiment;
          console.log("Sentiment data:", sentimentData);
        } else {
          console.warn("Sentiment API not ok:", await sentimentResponse.text());
        }

        // Analyze emotion
        const emotionResponse = await fetch(
          "https://api-inference.huggingface.co/models/j-hartmann/emotion-english-distilroberta-base",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${HF_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: entry_text,
              parameters: { return_all_scores: true },
              options: { wait_for_model: true },
            }),
          }
        );

        if (emotionResponse.ok) {
          const emotionData = await emotionResponse.json();
          emotions = normalizeEmotionResponse(emotionData) ?? emotions;
          console.log("Emotion data:", emotionData);
        } else {
          console.warn("Emotion API not ok:", await emotionResponse.text());
        }
      } catch (apiErr) {
        console.warn("HF analysis failed, falling back:", apiErr);
      }
    } else {
      console.warn("Hugging Face token not configured; using fallback analysis");
    }

    // Calculate scores based on analysis
    const { stress_score, happiness_score, therapy_note } = calculateScores(
      sentiment,
      emotions,
      entry_text
    );

    // Update journal entry with analysis using the caller's JWT (RLS-safe)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { error: updateError } = await supabase
      .from("journals")
      .update({
        stress_score,
        happiness_score: null, // deprecate happiness
        therapy_note,
        therapy_note_viewed: false,
      })
      .eq("id", journal_id);

    if (updateError) {
      console.error("Error updating journal:", updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        stress_score,
        happiness_score,
        therapy_note,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-journal:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function calculateScores(
  sentiment: any,
  emotions: any[],
  entry_text: string
): { stress_score: number; happiness_score: number; therapy_note: string } {
  // Get dominant emotion
  const dominantEmotion = emotions.reduce((prev, current) =>
    prev.score > current.score ? prev : current
  );

  // Calculate stress score (1-10)
  let stress_score = 5;
  const stressEmotions = ["anger", "fear", "sadness"];
  const calmEmotions = ["joy", "neutral"];

  if (stressEmotions.includes(dominantEmotion.label)) {
    stress_score = Math.round(5 + dominantEmotion.score * 5);
  } else if (calmEmotions.includes(dominantEmotion.label)) {
    stress_score = Math.round(5 - dominantEmotion.score * 4);
  }

  // Calculate happiness score (1-10) with robust label handling
  // Handles labels like POSITIVE/NEGATIVE and LABEL_1/LABEL_0
  let happiness_score = 5;
  const sentimentLabel = String(sentiment?.label || "").toUpperCase();
  const sentimentScore = typeof sentiment?.score === "number" ? sentiment.score : 0;
  const isPositive = sentimentLabel.includes("POS") || sentimentLabel.endsWith("_1") || sentimentLabel === "1";
  const isNegative = sentimentLabel.includes("NEG") || sentimentLabel.endsWith("_0") || sentimentLabel === "0";

  if (isPositive) {
    happiness_score = Math.round(5 + sentimentScore * 5);
  } else if (isNegative) {
    happiness_score = Math.round(5 - sentimentScore * 4);
  }

  // Generate therapy note
  const therapy_note = generateTherapyNote(
    dominantEmotion.label,
    stress_score,
    happiness_score,
    entry_text
  );

  return {
    stress_score: Math.max(1, Math.min(10, stress_score)),
    happiness_score: Math.max(1, Math.min(10, happiness_score)),
    therapy_note,
  };
}

function generateTherapyNote(
  emotion: string,
  stress: number,
  happiness: number,
  entry: string
): string {
  const wordCount = entry.split(" ").length;
  const isDetailed = wordCount > 100;

  let note = "";

  // Emotional assessment
  if (emotion === "joy") {
    note +=
      "Your entry reflects positive emotions. It's wonderful to see you experiencing joy. ";
  } else if (emotion === "sadness") {
    note +=
      "I notice you're experiencing some difficult emotions. Remember that it's okay to feel this way. ";
  } else if (emotion === "anger") {
    note +=
      "Your frustration is valid. Consider what's at the root of these feelings. ";
  } else if (emotion === "fear") {
    note +=
      "I can sense some anxiety in your words. Let's explore what feels overwhelming. ";
  } else {
    note += "Thank you for sharing your thoughts today. ";
  }

  // Stress assessment
  if (stress > 7) {
    note +=
      "Your stress levels seem elevated. Consider taking breaks and practicing relaxation techniques. ";
  } else if (stress < 4) {
    note += "You seem to be managing stress well. Keep up these positive patterns. ";
  }

  // Happiness assessment
  if (happiness > 7) {
    note +=
      "Your positive outlook is encouraging. Try to identify what's contributing to these good feelings. ";
  } else if (happiness < 4) {
    note +=
      "I notice your happiness levels are lower. Consider activities or people that typically lift your spirits. ";
  }

  // Length assessment
  if (isDetailed) {
    note +=
      "Your detailed reflection shows good self-awareness. Continue this practice of thorough self-expression.";
  } else {
    note +=
      "Consider expanding on your feelings in future entries for deeper insights.";
  }

  return note;
}

// Normalize various HF pipeline outputs into a predictable shape
function normalizeSentimentResponse(raw: any): { label: string; score: number } | null {
  // Two common formats:
  // 1) return_all_scores=true: [[{label, score}, {label, score}]]
  // 2) default pipeline: [{label, score}] or [[{label, score}]]
  try {
    if (Array.isArray(raw)) {
      const first = raw[0];
      if (Array.isArray(first)) {
        // choose the highest score
        const best = [...first].sort((a, b) => b.score - a.score)[0];
        return best ?? null;
      }
      if (first && typeof first === "object" && "label" in first && "score" in first) {
        return first as { label: string; score: number };
      }
    }
  } catch (_) {}
  return null;
}

function normalizeEmotionResponse(raw: any): Array<{ label: string; score: number }> | null {
  // Expected shapes:
  // 1) return_all_scores=true: [[{label, score}, ...]]
  // 2) sometimes: [{label, score}, ...]
  try {
    if (Array.isArray(raw)) {
      const first = raw[0];
      if (Array.isArray(first)) {
        return first as Array<{ label: string; score: number }>;
      }
      if (Array.isArray(raw)) {
        return raw as Array<{ label: string; score: number }>;
      }
    }
  } catch (_) {}
  return null;
}
