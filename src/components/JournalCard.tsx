import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { BellDot } from "lucide-react";

interface Journal {
  id: string;
  entry_text: string;
  stress_score: number | null;
  therapy_note: string | null;
  therapy_note_viewed?: boolean | null;
  created_at: string;
}

interface JournalCardProps {
  journal: Journal;
  onClick: () => void;
}

const JournalCard = ({ journal, onClick }: JournalCardProps) => {
  const getStressClasses = (score: number | null) => {
    if (!score) return {
      card: "bg-muted/40",
      label: "text-foreground",
    };
    if (score >= 7) {
      return {
        card: "bg-destructive/10",
        label: "text-destructive",
      };
    }
    if (score >= 4) {
      return {
        card: "bg-accent/10",
        label: "text-accent-foreground",
      };
    }
    return {
      card: "bg-secondary/10",
      label: "text-secondary-foreground",
    };
  };

  const preview = journal.entry_text.slice(0, 150) + (journal.entry_text.length > 150 ? "..." : "");

  const stress = getStressClasses(journal.stress_score);

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow duration-200 ${stress.card}`}
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">
              {format(new Date(journal.created_at), "MMMM d, yyyy")}
            </p>
            <p className="text-foreground/90 line-clamp-3 leading-relaxed">
              {preview}
            </p>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <div className="px-2 py-1 rounded-full text-xs font-medium border bg-white shadow-sm">
              <span className="text-muted-foreground mr-1">stress:</span>
              <span className={`${stress.label}`}>{journal.stress_score || "—"}</span>
            </div>
          </div>
        </div>
        {journal.therapy_note ? (
          !journal.therapy_note_viewed ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-primary">
              <BellDot className="h-4 w-4" />
              <span>New therapeutic insight available — click to view</span>
            </div>
          ) : null
        ) : (
          <p className="text-xs text-muted-foreground italic mt-2">Analyzing...</p>
        )}
      </CardContent>
    </Card>
  );
};

export default JournalCard;
