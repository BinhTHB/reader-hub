import { Star } from "lucide-react";

interface BookCardProps {
  cover: string;
  title: string;
  author: string;
  rating?: number;
  genre?: string;
  progress?: number;
  size?: "small" | "medium" | "large";
  onClick?: () => void;
}

export function BookCard({
  cover,
  title,
  author,
  rating,
  genre,
  progress,
  size = "medium",
  onClick,
}: BookCardProps) {
  const sizeClasses = {
    small: "w-24",
    medium: "w-32",
    large: "w-40",
  };

  return (
    <div
      onClick={onClick}
      className="flex flex-col gap-2 cursor-pointer group"
    >
      <div className={`${sizeClasses[size]} relative`}>
        <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
          <img
            src={cover}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
        {progress !== undefined && (
          <div className="absolute bottom-2 left-2 right-2 h-1.5 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <h4 className="font-medium text-sm line-clamp-2 text-foreground">
          {title}
        </h4>
        <p className="text-xs text-muted-foreground">{author}</p>
        {(rating || genre) && (
          <div className="flex items-center gap-2 mt-1">
            {rating && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="text-xs text-muted-foreground">{rating}</span>
              </div>
            )}
            {genre && (
              <span className="text-xs px-2 py-0.5 bg-secondary/20 text-secondary rounded-full">
                {genre}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
