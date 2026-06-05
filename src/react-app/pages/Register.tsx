import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/react-app/context/AuthContext";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import { UserPlus, Mail, Lock, User, Phone, Dumbbell, CheckCircle } from "lucide-react";

const COUNTRY_CODES = [
  { label: "India (+91)", value: "+91" },
  { label: "United States (+1)", value: "+1" },
  { label: "United Kingdom (+44)", value: "+44" },
  { label: "Australia (+61)", value: "+61" },
];

const NAME_REGEX = /^[A-Za-z\s]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{6,}$/;

export default function Register() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [countryCode, setCountryCode] = useState("+91");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "name") {
      const sanitizedName = value.replace(/[^A-Za-z\s]/g, "");
      setFormData({ ...formData, name: sanitizedName });
      return;
    }

    if (name === "phone") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
      setFormData({ ...formData, phone: digitsOnly });
      return;
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = formData.name.trim().replace(/\s+/g, " ");

    if (!trimmedName || !NAME_REGEX.test(trimmedName)) {
      setError("Name should contain only letters and spaces");
      return;
    }

    if (formData.phone.length !== 10) {
      setError("Phone number must be exactly 10 digits");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!PASSWORD_REGEX.test(formData.password)) {
      setError("Password must be at least 6 characters and include letters and a special character");
      return;
    }

    setIsLoading(true);
    const result = await register({
      name: trimmedName,
      email: formData.email,
      phone: `${countryCode} ${formData.phone}`,
      password: formData.password,
    });
    setIsLoading(false);

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || "Registration failed");
    }
  };

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 bg-center bg-cover bg-no-repeat"
        style={{
          backgroundImage:
            "linear-gradient(rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.72)), url('/bg.jpg')",
        }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative">
          <div className="gradient-card rounded-2xl border border-border/50 p-8 backdrop-blur-sm glow-accent text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-4">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Registration Submitted</h2>
            <p className="text-white/80 mb-6">
              Your registration is pending admin approval. You'll be able to log in once approved.
            </p>
            <Button
              onClick={() => navigate("/login")}
              className="gradient-accent text-primary-foreground font-semibold"
            >
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-center bg-cover bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.72)), url('/bg.jpg')",
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
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
            Join our fitness community
          </p>
        </div>

        <div className="gradient-card rounded-2xl border border-border/50 p-8 backdrop-blur-sm glow-accent">
          <div className="flex items-center gap-2 mb-6">
            <UserPlus className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-white">Create Account</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-muted-foreground">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  pattern="[A-Za-z\s]+"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">Only letters and spaces are allowed.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-muted-foreground">Phone Number</Label>
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="w-40 bg-background/50 border-border/50 focus:border-primary">
                    <SelectValue placeholder="Code" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="9876543210"
                    className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                    inputMode="numeric"
                    maxLength={10}
                    pattern="\d{10}"
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter a 10-digit phone number after selecting the country code.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="********"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  minLength={6}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use at least 6 characters with letters and a special character.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-muted-foreground">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="********"
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full gradient-accent text-primary-foreground font-semibold h-11 hover:opacity-90 transition-opacity mt-2"
            >
              {isLoading ? "Creating Account..." : "Register"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              Already a member?{" "}
              <Link to="/login" className="text-cyan-300 hover:text-cyan-200 hover:underline font-medium">
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-muted-foreground/60 text-xs mt-6">
          Registration requires admin approval
        </p>
      </div>
    </div>
  );
}
