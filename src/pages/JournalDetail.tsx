import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Meh, Pencil, Trash2, Save, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

interface Journal {
  id: string;
  entry_text: string;
  stress_score: number | null;
  therapy_note: string | null;
  therapy_note_viewed?: boolean | null;
  created_at: string;
}

const JournalDetail = () => {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

  useEffect(() => {
    loadJournal();
  }, [id]);

  const loadJournal = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from("journals")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error loading journal:", error);
      navigate("/dashboard");
      return;
    }

    setJournal(data);
    setEditText(data.entry_text);
    setLoading(false);
  };

  const startEditing = () => {
    if (!journal) return;
    setEditText(journal.entry_text);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (journal) setEditText(journal.entry_text);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!id || !editText.trim()) return;
    try {
      setSaving(true);
      // Update entry text; keep existing analysis until new one completes
      const { data, error } = await supabase
        .from("journals")
        .update({ entry_text: editText })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Optimistically update local state
      setJournal((prev) =>
        prev
          ? {
              ...prev,
              entry_text: editText,
            }
          : data,
      );
      setIsEditing(false);

      toast({ title: "Entry updated", description: "Analyzing your updated entry..." });

      // Re-run analysis
      setAnalyzing(true);
      const { error: functionError } = await supabase.functions.invoke("analyze-journal", {
        body: { entry_text: editText, journal_id: id },
      });

      if (functionError) {
        console.error("Analysis error:", functionError);
        toast({
          title: "Analysis incomplete",
          description: "Entry updated but analysis failed. Please refresh and try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Analysis complete!", description: "Your journal has been re-analyzed." });
      }

      // Reload to get fresh scores/notes
      await loadJournal();
    } catch (err: any) {
      console.error("Error updating journal:", err);
      toast({ title: "Error updating entry", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setAnalyzing(false);
    }
  };

  const confirmDelete = async () => {
    if (!id) return;
    try {
      setDeleting(true);
      const { error } = await supabase
        .from("journals")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Entry deleted", description: "Your journal entry has been removed." });
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Error deleting journal:", err);
      toast({ title: "Error deleting entry", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    // Mark therapy note as viewed when present and not yet marked
    const markViewed = async () => {
      if (!id || !journal?.therapy_note || journal.therapy_note_viewed) return;
      const { error } = await supabase
        .from("journals")
        .update({ therapy_note_viewed: true })
        .eq("id", id);
      if (error) {
        console.warn("Failed to mark therapy note viewed:", error);
      } else {
        setJournal((prev) => (prev ? { ...prev, therapy_note_viewed: true } : prev));
      }
    };
    markViewed();
  }, [id, journal?.therapy_note]);

  const getStressColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 7) return "bg-destructive/20";
    if (score >= 4) return "bg-accent/20";
    return "bg-secondary/20";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!journal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Journal not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Journal Entry</h1>
            <p className="text-muted-foreground">
              {format(new Date(journal.created_at), "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`h-6 w-6 rounded-full ${getStressColor(journal.stress_score)}`} />
            <div className="text-right">
              <div className="text-sm font-medium">Stress</div>
              <div className="text-2xl font-bold text-primary">{journal.stress_score || "—"}/10</div>
            </div>
          </div>
        </div>

        <Card
          className={
            journal.stress_score == null
              ? ""
              : journal.stress_score >= 7
              ? "bg-destructive/10"
              : journal.stress_score >= 4
              ? "bg-accent/10"
              : "bg-secondary/10"
          }
        >
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your Entry</CardTitle>
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={startEditing}
                    disabled={saving || deleting || analyzing}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={saving || deleting}>
                        {deleting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Deleting
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" /> Delete
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your journal entry.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>
                          Confirm Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : (
                <>
                  <Button onClick={saveEdit} disabled={saving || deleting || !editText.trim()}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Save
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={cancelEditing} disabled={saving || deleting}>
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!isEditing ? (
              <>
                <div className="mb-4 flex items-center justify-end">
                  <div className="px-2 py-1 rounded-full text-xs font-medium border bg-white shadow-sm">
                    <span className="text-muted-foreground mr-1">stress:</span>
                    <span className="text-foreground">{journal.stress_score || "—"}</span>
                  </div>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{journal.entry_text}</p>
              </>
            ) : (
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[200px] resize-none"
                disabled={saving}
              />
            )}
          </CardContent>
        </Card>

        {journal.therapy_note && (
          <Card className="bg-accent/10 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🌿 Therapeutic Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-foreground/90">
                {journal.therapy_note}
              </p>
            </CardContent>
          </Card>
        )}

        {!journal.therapy_note && (
          <Card className="bg-muted/50">
            <CardContent className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p>AI analysis in progress...</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default JournalDetail;
