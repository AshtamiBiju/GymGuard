import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/react-app/context/AuthContext";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Shield, Mail, Lock, Dumbbell } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      navigate("/dashboard");
    } else {
      setError(result.error || "Login failed");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-center bg-cover bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.72)), url('/login-bg.jpg')",
      }}
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[1.75rem] gradient-accent glow-primary mb-5 shadow-[0_0_40px_-8px_rgba(34,211,238,0.45)]">
            <Dumbbell className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white leading-none">
            <span className="bg-gradient-to-r from-white via-fuchsia-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(34,211,238,0.18)]">
              GymGuard
            </span>
          </h1>
          <p className="text-base md:text-lg text-white/70 mt-3 tracking-[0.2em] uppercase">
            Access Control System
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-white/35 bg-slate-950/35 p-8 backdrop-blur-md glow-accent">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-cyan-300" />
            <h2 className="text-xl font-semibold text-white">Sign In</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full gradient-accent text-primary-foreground font-semibold h-11 hover:opacity-90 transition-opacity"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              New member?{" "}
              <Link to="/register" className="text-cyan-300 hover:text-cyan-200 hover:underline font-medium">
                Register here
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground/60 text-xs mt-6">
          Secure gym access management
        </p>
      </div>
    </div>
  );
}
