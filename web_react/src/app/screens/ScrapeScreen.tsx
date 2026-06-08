import { useState, useEffect } from "react";
import {
  Search,
  BookOpen,
  Download,
  AlertCircle,
  CheckCircle,
  Loader,
  Play,
  Clock,
  Zap,
  Database,
  Cloud,
  Shield,
  List,
  Star,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

interface SearchResult {
  id: string;
  title: string;
  author: string;
  cover: string;
  url: string;
  source: string;
  chapters: number;
  rating?: number;
  description?: string;
}

interface ScrapeJob {
  id: string;
  url: string;
  status: "pending" | "detecting_parser" | "scraping_metadata" | "uploading_cover" | "scraping_chapters" | "completed" | "failed" | "canceled";
  progress: number;
  currentStep: string;
  parser?: string;
  metadata?: {
    title: string;
    author: string;
    cover_r2_url: string;
    total_chapters: number;
  };
  chapters_scraped?: number;
  total_chapters?: number;
  chapter_start?: number;
  chapter_end?: number;
  logs: string[];
  created_at: string;
  completed_at?: string;
  error?: string;
}

interface ScrapeScreenProps {
  onNavigate?: (screen: string, data?: any) => void;
}

const getParserName = (job: ScrapeJob) => {
  if (job.parser && job.parser.trim() !== '') return job.parser;
  try {
    const urlObj = new URL(job.url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
};

const renderJobProgressText = (job: ScrapeJob) => {
  const startCh = job.chapter_start || 1;
  const scrapedCount = job.chapters_scraped || 0;
  const totalCh = job.metadata?.total_chapters || job.total_chapters || 0;
  
  if (scrapedCount === 0) {
    if (totalCh > 0) {
      return (
        <span className="text-xs text-muted-foreground">
          Chưa cào (Chương mới nhất: <span className="font-semibold text-primary">{totalCh}</span>)
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">Chưa cào chương nào</span>;
  }
  
  const endCh = startCh + scrapedCount - 1;
  const maxCh = totalCh || job.chapter_end || 0;
  
  return (
    <div className="text-xs space-y-1 mt-1">
      <p className="text-muted-foreground">
        Tiến độ: chương <span className="font-semibold text-primary">{endCh}</span>/<span className="font-semibold text-primary">{maxCh}</span>
      </p>
    </div>
  );
};

export function ScrapeScreen({ onNavigate }: ScrapeScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeJob, setActiveJob] = useState<ScrapeJob | null>(null);
  const [jobHistory, setJobHistory] = useState<ScrapeJob[]>([]);
  const [error, setError] = useState("");
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [availableSources, setAvailableSources] = useState<string[]>([]);

  // Load job history from Supabase
  useEffect(() => {
    const loadJobHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('scrape_jobs')
          .select(`
            *,
            stories (
              title,
              author,
              cover_url,
              total_chapters,
              source_name
            )
          `)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          console.error('Failed to load job history:', error);
          return;
        }

        if (data) {
          const formattedJobs: ScrapeJob[] = data.map((job: any) => {
            // Map status correctly - handle all possible values from GitHub Actions
            let mappedStatus: ScrapeJob["status"] = "pending";
            const rawStatus = (job.status || '').toLowerCase();
            
            if (rawStatus === 'completed' || rawStatus === 'success') {
              mappedStatus = "completed";
            } else if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'failure') {
              mappedStatus = "failed";
            } else if (rawStatus === 'canceled' || rawStatus === 'cancelled') {
              mappedStatus = "canceled";
            } else if (rawStatus === 'running' || rawStatus === 'scraping_chapters' || rawStatus === 'in_progress') {
              mappedStatus = "scraping_chapters";
            } else if (rawStatus === 'pending' || rawStatus === 'queued') {
              mappedStatus = "pending";
            } else {
              // If status is unknown and job is old (>10 minutes), assume failed
              const createdAt = new Date(job.created_at).getTime();
              const now = Date.now();
              const tenMinutes = 10 * 60 * 1000;
              
              if (now - createdAt > tenMinutes) {
                mappedStatus = "failed";
              }
            }

            return {
              id: job.id.toString(),
              url: job.stories?.source_url || '',
              status: mappedStatus,
              progress: mappedStatus === 'completed'
                ? 100
                : mappedStatus === 'failed'
                  ? 0
                  : (job.chapter_start && job.chapter_end && job.chapter_end >= job.chapter_start)
                    ? Math.min(99, Math.round(((job.chapters_scraped || 0) / (job.chapter_end - job.chapter_start + 1)) * 100))
                    : 10,
              currentStep: mappedStatus === 'completed' ? 'Hoàn tất!' : mappedStatus === 'failed' ? 'Thất bại' : mappedStatus === 'canceled' ? 'Đã hủy' : mappedStatus === 'pending' ? 'Đang chờ...' : 'Đang chạy...',
              parser: job.stories?.source_name || '',
              metadata: job.stories ? {
                title: job.stories.title,
                author: job.stories.author,
                cover_r2_url: job.stories.cover_url,
                total_chapters: job.stories.total_chapters,
              } : undefined,
              chapters_scraped: job.chapters_scraped || 0,
              total_chapters: job.stories?.total_chapters || 0,
              chapter_start: job.chapter_start || 1,
              chapter_end: job.chapter_end || 0,
              logs: [],
              created_at: job.created_at,
              completed_at: job.completed_at,
              error: job.error_message,
            };
          });
          setJobHistory(formattedJobs);
        }
      } catch (err) {
        console.error('Error loading job history:', err);
      }
    };

    loadJobHistory();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Vui lòng nhập tên truyện");
      return;
    }

    setIsSearching(true);
    setError("");
    setSearchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('search-sources', {
        body: { query: searchQuery.trim() }
      });

      if (error) {
        console.error('Search error:', error);
        setError("Lỗi khi tìm kiếm. Vui lòng thử lại.");
        setIsSearching(false);
        return;
      }

      if (data && data.sources) {
        const allResults: SearchResult[] = [];
        
        data.sources.forEach((source: any) => {
          if (source.results && Array.isArray(source.results)) {
            source.results.forEach((result: any) => {
              allResults.push({
                id: `${source.source_name}_${result.sourceUrl}`,
                title: cleanTitle(result.title),
                author: result.author || 'Đang cập nhật',
                cover: result.coverUrl || '',
                url: result.sourceUrl,
                source: result.sourceDisplay,
                chapters: 0,
                description: '',
              });
            });
          }
        });

        setSearchResults(allResults);
        
        // Deduplicate by (source + url) and normalize titles
        const seen = new Set<string>();
        const cleanedResults: SearchResult[] = [];
        for (const r of allResults) {
          const key = `${r.source}_${r.url}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cleanedResults.push({
            ...r,
            title: cleanTitle(r.title),
          });
        }

        // Extract unique source names for toggle filters
        const uniqueSources = [...new Set(cleanedResults.map(r => r.source))];
        setAvailableSources(uniqueSources);
        setActiveSources(new Set(uniqueSources));
        setSearchResults(cleanedResults);
        
        if (cleanedResults.length === 0) {
          setError("Không tìm thấy kết quả phù hợp. Thử từ khóa khác.");
        }
      } else {
        setError("Không tìm thấy kết quả phù hợp. Thử từ khóa khác.");
      }
    } catch (err) {
      console.error('Search exception:', err);
      setError("Lỗi khi tìm kiếm. Vui lòng thử lại.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleScrapeResult = async (result: SearchResult) => {
    setSearchResults([]);
    setSearchQuery("");

    try {
      const { data, error } = await supabase.functions.invoke('trigger-scraper', {
        body: {
          source_url: result.url,
          chapter_start: 0,
          chapter_limit: 0
        }
      });

      if (error) {
        console.error('Trigger scraper error:', error);
        setError("Lỗi khi khởi tạo scraper. Vui lòng thử lại.");
        return;
      }

      if (data && data.job_id) {
        const jobId = data.job_id.toString();
        
        const initialJob: ScrapeJob = {
          id: jobId,
          url: result.url,
          status: "pending",
          progress: 0,
          currentStep: "Đang khởi tạo...",
          logs: [`[${new Date().toLocaleTimeString()}] Job ${jobId} created`],
          created_at: new Date().toISOString(),
        };
        
        setActiveJob(initialJob);

        const channel = supabase
          .channel(`job:${jobId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'scrape_jobs',
              filter: `id=eq.${jobId}`
            },
            (payload) => {
              const updatedJob = payload.new as any;
              const rawStatus = (updatedJob.status || '').toLowerCase();
              let mappedStatus: ScrapeJob["status"] = "pending";
              if (rawStatus === 'completed' || rawStatus === 'success') {
                mappedStatus = "completed";
              } else if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'failure') {
                mappedStatus = "failed";
              } else if (rawStatus === 'canceled' || rawStatus === 'cancelled') {
                mappedStatus = "canceled";
              } else if (rawStatus === 'running' || rawStatus === 'scraping_chapters' || rawStatus === 'in_progress') {
                mappedStatus = "scraping_chapters";
              }
              
              const job: ScrapeJob = {
                id: updatedJob.id.toString(),
                url: result.url,
                status: mappedStatus,
                progress: mappedStatus === 'completed'
                  ? 100
                  : mappedStatus === 'failed'
                    ? 0
                    : (updatedJob.chapter_start && updatedJob.chapter_end && updatedJob.chapter_end >= updatedJob.chapter_start)
                      ? Math.min(99, Math.round(((updatedJob.chapters_scraped || 0) / (updatedJob.chapter_end - updatedJob.chapter_start + 1)) * 100))
                      : 10,
                currentStep: mappedStatus === 'completed' ? 'Hoàn tất!' : mappedStatus === 'failed' ? 'Thất bại' : mappedStatus === 'canceled' ? 'Đã hủy' : 'Đang cào...',
                chapters_scraped: updatedJob.chapters_scraped || 0,
                total_chapters: updatedJob.chapter_end || 0,
                chapter_start: updatedJob.chapter_start || 1,
                chapter_end: updatedJob.chapter_end || 0,
                logs: [`[${new Date().toLocaleTimeString()}] Status: ${mappedStatus}`],
                created_at: updatedJob.created_at,
                completed_at: updatedJob.completed_at,
                error: updatedJob.error_message,
              };
              
              setActiveJob(job);
              
              if (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'canceled') {
                setJobHistory(prev => [job, ...prev]);
                channel.unsubscribe();
              }
            }
          )
          .subscribe();

      } else {
        setError("Không thể khởi tạo scraper. Vui lòng thử lại.");
      }
    } catch (err) {
      console.error('Scrape exception:', err);
      setError("Lỗi khi khởi tạo scraper. Vui lòng thử lại.");
    }
  };

  const getStatusColor = (status: ScrapeJob["status"]) => {
    switch (status) {
      case "completed": return "text-green-600 bg-green-50 border-green-200";
      case "failed": return "text-red-600 bg-red-50 border-red-200";
      case "canceled": return "text-orange-600 bg-orange-50 border-orange-200";
      case "pending": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      default: return "text-blue-600 bg-blue-50 border-blue-200";
    }
  };

  const getStatusIcon = (status: ScrapeJob["status"]) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4" />;
      case "failed": return <AlertCircle className="w-4 h-4" />;
      case "canceled": return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case "pending": return <Clock className="w-4 h-4" />;
      default: return <Loader className="w-4 h-4 animate-spin" />;
    }
  };

  const getStatusText = (status: ScrapeJob["status"]) => {
    switch (status) {
      case "completed": return "Hoàn thành";
      case "failed": return "Thất bại";
      case "canceled": return "Bị hủy";
      case "pending": return "Đang chờ";
      case "detecting_parser": return "Đang phát hiện parser";
      case "scraping_metadata": return "Đang cào metadata";
      case "uploading_cover": return "Đang tải ảnh bìa";
      case "scraping_chapters": return "Đang cào chương";
      default: return status;
    }
  };

  const toggleSource = (source: string) => {
    setActiveSources(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const cleanTitle = (raw: string) => {
    let t = raw
      .replace(/^\d+[Cc]\.\s*[Cc]hương\s*\d+/g, "")
      .replace(/^\d+[Cc]\./g, "")
      .replace(/AI$/g, "")
      .replace(/\([^)]*\)/g, "")
      .trim();
    return t.length >= 3 ? t : raw.replace(/\s+/g, " ").trim();
  };

  const getUniqueCover = (title: string, index: number) => {
    const hue = ((title.length * 31 + index * 17) % 360);
    const firstChar = title.charAt(0).toUpperCase() || '?';
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><defs><linearGradient id="g"><stop offset="0%" stop-color="hsl(${hue},40%,25%)"/><stop offset="100%" stop-color="hsl(${(hue + 60) % 360},40%,15%)"/></linearGradient></defs><rect fill="url(#g)" width="400" height="600"/><text x="200" y="320" text-anchor="middle" fill="rgba(255,255,255,0.15)" font-size="120" font-family="serif">${firstChar}</text></svg>`
    )}`;
  };

  const filteredResults = searchResults.filter(r => activeSources.has(r.source));

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary px-4 pt-12 pb-8 text-white">
        <h1 className="text-2xl font-medium mb-2">Cào truyện từ Web</h1>
        <p className="text-sm text-white/80">
          Tìm kiếm và scrape truyện từ nhiều nguồn
        </p>
      </div>

      <div className="px-4 -mt-6">
        {/* Search Input Card */}
        <div className="bg-card rounded-2xl p-4 shadow-lg border border-border mb-6">
          <label className="text-sm font-medium mb-2 block">
            Tìm kiếm truyện
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Nhập tên truyện, ví dụ: Kiếm Thần..."
                className="w-full pl-10 pr-4 py-3 bg-input-background rounded-xl border border-border/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                disabled={activeJob?.status && activeJob.status !== "completed" && activeJob.status !== "failed"}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || (activeJob?.status && activeJob.status !== "completed" && activeJob.status !== "failed")}
              className="px-6 py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {isSearching ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Đang tìm...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Tìm
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        {/* Source Filters */}
        {availableSources.length > 1 && searchResults.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Nguồn:</span>
              {availableSources.map(source => {
                const isActive = activeSources.has(source);
                const count = searchResults.filter(r => r.source === source).length;
                return (
                  <button
                    key={source}
                    onClick={() => toggleSource(source)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-muted-foreground border-border/50 hover:border-primary/50'
                    }`}
                  >
                    {isActive ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current" />}
                    {source}
                    <span className={`text-[10px] px-1 rounded ${isActive ? 'bg-white/20' : 'bg-muted'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-medium mb-4">
              Kết quả tìm kiếm ({filteredResults.length})
            </h2>
            <div className="space-y-3">
              {filteredResults.length === 0 && availableSources.length > 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Không có kết quả nào được hiển thị. Hãy bật ít nhất một nguồn ở trên.
              </div>
            )}
            <div className="space-y-3">
              {filteredResults.map((result, idx) => (
                <div
                  key={result.id}
                  className="bg-card rounded-xl border border-border/50 p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex gap-3">
                    <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={result.cover || getUniqueCover(result.title, idx)}
                        alt={result.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium mb-1">{result.title}</h3>
                      <p className="text-sm text-muted-foreground mb-1">
                        {result.author}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {result.chapters} chương
                        </span>
                        {result.rating && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            {result.rating}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                          {result.source}
                        </span>
                      </div>
                      {result.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                          {result.description}
                        </p>
                      )}
                      <button
                        onClick={() => handleScrapeResult(result)}
                        className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Scrape truyện này
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
            </div>
        )}

        {/* Active Job Progress */}
        {activeJob && (
          <div className="bg-card rounded-2xl p-4 shadow-lg border border-border mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-medium truncate">Job: {activeJob.id}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${getStatusColor(activeJob.status)}`}>
                    {getStatusIcon(activeJob.status)}
                    {getStatusText(activeJob.status)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{activeJob.url}</p>
                {activeJob.parser && (
                  <p className="text-xs text-muted-foreground mt-1">Parser: {activeJob.parser}</p>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium">{activeJob.currentStep}</span>
                <span className="text-muted-foreground">{Math.round(activeJob.progress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
            </div>

            {/* Chapter Progress */}
            {activeJob.status === "scraping_chapters" && activeJob.chapters_scraped !== undefined && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-blue-900 dark:text-blue-100">
                    Đang cào chương...
                  </span>
                  <span className="text-blue-700 dark:text-blue-300 font-medium">
                    Chương {activeJob.chapter_start} - {activeJob.chapter_end || '?'} ({activeJob.chapters_scraped} / {activeJob.chapter_end && activeJob.chapter_start ? (activeJob.chapter_end - activeJob.chapter_start + 1) : (activeJob.metadata?.total_chapters || activeJob.total_chapters || 'Tất cả')})
                  </span>
                </div>
              </div>
            )}

            {/* Metadata Preview */}
            {activeJob.metadata && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={activeJob.metadata.cover_r2_url}
                      alt={activeJob.metadata.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-green-900 dark:text-green-100 truncate">
                      {activeJob.metadata.title}
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {activeJob.metadata.author}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {activeJob.metadata.total_chapters} chương
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Logs Console */}
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-48 overflow-y-auto">
              {activeJob.logs.map((log, idx) => (
                <div key={idx} className="mb-1">
                  {log}
                </div>
              ))}
            </div>

            {/* Action & Info for Completed Jobs */}
            {activeJob.status === "completed" && (
              <div className="mt-4 space-y-3">
                {activeJob.error && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      <strong>Thông tin:</strong> {activeJob.error}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => onNavigate?.("library")}
                  className="w-full px-4 py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-5 h-5" />
                  Xem trong thư viện
                </button>
              </div>
            )}

            {/* Retry Button for Failed or Canceled Jobs */}
            {(activeJob.status === "failed" || activeJob.status === "canceled") && (
              <div className="mt-4 space-y-3">
                {activeJob.error && (
                  <div className={`p-3 rounded-lg border text-sm ${
                    activeJob.status === "canceled"
                      ? "bg-orange-50/50 dark:bg-orange-950/10 border-orange-200 dark:border-orange-900 text-orange-800 dark:text-orange-400"
                      : "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400"
                  }`}>
                    <p>
                      <strong>{activeJob.status === "canceled" ? "Thông tin:" : "Lỗi:"}</strong> {activeJob.error}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setActiveJob(null);
                    setError("");
                  }}
                  className={`w-full px-4 py-3 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 ${
                    activeJob.status === "canceled" ? "bg-orange-600" : "bg-red-600"
                  }`}
                >
                  <RefreshCw className="w-5 h-5" />
                  {activeJob.status === "canceled" ? "Quay lại" : "Thử lại"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Job History */}
        {jobHistory.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Lịch sử Jobs
            </h2>
            <div className="space-y-3">
              {jobHistory.map((job) => (
                <div
                  key={job.id}
                  className="bg-card rounded-xl border border-border/50 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium truncate">{job.id}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${getStatusColor(job.status)}`}>
                          {getStatusIcon(job.status)}
                          {getStatusText(job.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{job.url}</p>
                    </div>
                  </div>

                  {job.metadata && (
                    <div className="flex items-center gap-3 mt-3 p-2 bg-muted/50 rounded-lg">
                      <div className="w-12 aspect-[2/3] rounded overflow-hidden flex-shrink-0">
                        <img
                          src={job.metadata.cover_r2_url}
                          alt={job.metadata.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-medium truncate">{job.metadata.title}</h5>
                        <p className="text-xs text-muted-foreground">{job.metadata.author}</p>
                        {renderJobProgressText(job)}
                      </div>
                    </div>
                  )}

                  {job.error && (
                    <div className={`mt-3 p-2.5 rounded-lg border text-xs ${
                      job.status === "completed" 
                        ? "bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-400"
                        : job.status === "canceled"
                          ? "bg-orange-50/50 dark:bg-orange-950/10 border-orange-100 dark:border-orange-900 text-orange-800 dark:text-orange-400"
                          : "bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900 text-red-800 dark:text-red-400"
                    }`}>
                      <strong>{job.status === "completed" ? "Kết quả:" : job.status === "canceled" ? "Thông tin:" : "Chi tiết lỗi:"}</strong> {job.error}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <span>Parser: <span className="font-medium text-foreground">{getParserName(job)}</span></span>
                    <span>{new Date(job.created_at).toLocaleString("vi-VN")}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
