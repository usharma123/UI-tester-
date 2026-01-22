import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Camera } from "lucide-react";
import type { Screenshot } from "@/lib/types";

interface ScreenshotsGalleryProps {
  screenshots: Screenshot[];
  onImageClick: (src: string, label: string) => void;
}

export function ScreenshotsGallery({
  screenshots,
  onImageClick,
}: ScreenshotsGalleryProps) {
  if (screenshots.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-lg font-medium">
          <Camera className="w-5 h-5 text-muted-foreground" />
          Screenshots
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {screenshots.map((screenshot, idx) => (
            <button
              key={idx}
              onClick={() => onImageClick(screenshot.url, screenshot.label)}
              className="group rounded-lg overflow-hidden border border-border hover:border-foreground transition-all hover:-translate-y-1 hover:shadow-lg bg-secondary/50"
            >
              <AspectRatio ratio={16 / 10}>
                <img
                  src={screenshot.url}
                  alt={screenshot.label}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </AspectRatio>
              <div className="p-2 text-xs font-medium text-muted-foreground truncate border-t border-border/50 bg-card">
                {screenshot.label}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
