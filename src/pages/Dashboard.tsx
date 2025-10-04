import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User, Session } from "@supabase/supabase-js";
import { LogOut, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import JournalCard from "@/components/JournalCard";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface Journal {
  id: string;
  entry_text: string;
  stress_score: number | null;
  therapy_note: string | null;
  therapy_note_viewed?: boolean | null;
  created_at: string;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [entry, setEntry] = useState("");
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (!session) {
          navigate("/auth");
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      loadJournals();
      loadProfile();
    }
  }, [user]);
  const loadProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();
    if (!error && data) {
      setDisplayName(data.display_name || user.email?.split("@")[0] || "You");
      setAvatarUrl(data.avatar_url);
    }
  };

  const loadJournals = async () => {
    const { data, error } = await supabase
      .from("journals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading journals:", error);
      return;
    }

    setJournals(data || []);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry.trim() || !user) return;

    setLoading(true);

    try {
      // Create journal entry
      const { data: journal, error: insertError } = await supabase
        .from("journals")
        .insert({
          entry_text: entry,
          user_id: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast({
        title: `Nice work, ${displayName || "friend"}!`,
        description: "Analyzing your journal entry...",
      });

      setEntry("");
      setAnalyzing(true);

      // Analyze with AI
      const { error: functionError } = await supabase.functions.invoke(
        "analyze-journal",
        {
          body: {
            entry_text: journal.entry_text,
            journal_id: journal.id,
          },
        }
      );

      if (functionError) {
        console.error("Analysis error:", functionError);
        toast({
          title: `Heads up, ${displayName || "friend"}`,
          description: "Entry saved but analysis failed. Please try refreshing.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `All set, ${displayName || "friend"}!`,
          description: "Your journal has been analyzed.",
        });
      }

      // Reload journals
      await loadJournals();
    } catch (error: any) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="MindScribe" className="h-10 w-10" />
            <h1 className="text-2xl font-semibold text-foreground">MindScribe</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 pr-3 border-r">
              <Avatar className="h-8 w-8">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} />
                ) : (
                  <AvatarFallback>{(displayName || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <div className="text-sm text-foreground/90 max-w-[12rem] truncate">{displayName}</div>
            </div>
            <ThemeToggle />
            <Button variant="outline" onClick={() => navigate("/profile")}>Profile</Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>How are you feeling today, {displayName || "friend"}?</CardTitle>
            <CardDescription>
              Write about your thoughts, feelings, and experiences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Textarea
                placeholder="Start writing your journal entry..."
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                className="min-h-[200px] resize-none"
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !entry.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Saving..." : "Save Entry"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {analyzing && (
          <div className="mb-6 p-4 bg-accent/20 rounded-lg flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm">AI is analyzing your entry...</p>
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Your Journal Entries</h2>
          {journals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No journal entries yet. Start writing to begin your journey!
              </CardContent>
            </Card>
          ) : (
            journals.map((journal) => (
              <JournalCard
                key={journal.id}
                journal={journal}
                onClick={() => navigate(`/journal/${journal.id}`)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
