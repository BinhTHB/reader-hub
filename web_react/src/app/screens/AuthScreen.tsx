import { useState } from "react";
import { ChevronLeft, Mail, Lock, User, AlertCircle, RefreshCw, Eye, EyeOff } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface AuthScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function AuthScreen({ onBack, onSuccess }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    if (!validateEmail(email)) {
      setError("Email không đúng định dạng");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu phải chứa ít nhất 6 ký tự");
      return;
    }

    if (!isLogin && !displayName.trim()) {
      setError("Vui lòng nhập tên hiển thị");
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        // Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });
        if (error) throw error;
      } else {
        // Sign Up
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });
        if (error) throw error;
      }
      
      onSuccess();
    } catch (err: any) {
      console.error("Auth error:", err);
      // Translate common error messages
      let friendlyMessage = err.message;
      if (err.message === "Invalid login credentials") {
        friendlyMessage = "Email hoặc mật khẩu không chính xác";
      } else if (err.message === "User already registered") {
        friendlyMessage = "Email này đã được đăng ký tài khoản";
      }
      setError(friendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-6">
      {/* Top Header */}
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="p-2 hover:bg-muted rounded-full transition-colors"
          disabled={isLoading}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content Card */}
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full my-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {isLogin ? "Chào mừng trở lại" : "Tạo tài khoản"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {isLogin
              ? "Đăng nhập để đồng bộ lịch sử đọc và truyện yêu thích"
              : "Bắt đầu hành trình đọc truyện của bạn ngay hôm nay"}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start gap-3 mb-6 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tên hiển thị</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Nhập tên của bạn"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-card border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="email"
                placeholder="example@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-card border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Tối thiểu 6 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-card border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                disabled={isLoading}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-2 shadow-lg shadow-primary/20"
          >
            {isLoading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : isLogin ? (
              "Đăng nhập"
            ) : (
              "Đăng ký"
            )}
          </button>
        </form>

        <div className="text-center mt-6 text-sm">
          <span className="text-muted-foreground">
            {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
          </span>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-primary font-semibold hover:underline"
            disabled={isLoading}
          >
            {isLogin ? "Đăng ký ngay" : "Đăng nhập tại đây"}
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-muted-foreground">
        Bằng cách tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của chúng tôi.
      </div>
    </div>
  );
}
