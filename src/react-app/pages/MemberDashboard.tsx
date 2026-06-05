import { useState, useEffect } from "react";
import { useAuth } from "@/react-app/context/AuthContext";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import { 
  Dumbbell, 
  LogOut, 
  Calendar, 
  Clock,
  User,
  AlertCircle,
  BellRing,
  CheckCircle,
  XCircle,
  RefreshCw
} from "lucide-react";

interface Membership {
  start_date: string | null;
  expiry_date: string | null;
}

interface AccessLog {
  id: number;
  entry_time: string;
  status: string;
}

export default function MemberDashboard() {
  const { user, logout, token } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [membershipRes, logsRes] = await Promise.all([
        fetch("/api/member/membership", { headers }),
        fetch("/api/member/access-logs", { headers }),
      ]);

      const membershipData = await membershipRes.json();
      const logsData = await logsRes.json();

      setMembership(membershipData.membership);
      setAccessLogs(logsData.logs || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.status === "approved") {
      fetchData();
    } else {
      setIsLoading(false);
    }
  }, [user?.status]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseDateOnly = (dateStr: string) => {
    const normalizedDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    return new Date(`${normalizedDate}T00:00:00`);
  };

  const getStartOfToday = () => parseDateOnly(new Date().toISOString());

  const getDaysRemaining = () => {
    if (!membership?.expiry_date) return null;
    const today = getStartOfToday();
    const expiry = parseDateOnly(membership.expiry_date);
    const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const daysRemaining = getDaysRemaining();
  const isExpired = daysRemaining !== null && daysRemaining < 0;
  const isExpiringSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;
  const shouldShowExpiryReminder = daysRemaining === 1;
  const hasActiveMembership = membership !== null && !isExpired;

  if (user?.status === "pending") {
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
          <div className="gradient-card rounded-2xl border border-border/50 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/20 mb-4">
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Pending Approval</h2>
            <p className="text-white/80 mb-6">
              Your account is awaiting admin approval. You'll have full access once approved.
            </p>
            <Button onClick={logout} variant="outline">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (user?.status === "rejected") {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 bg-center bg-cover bg-no-repeat"
        style={{
          backgroundImage:
            "linear-gradient(rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.72)), url('/bg.jpg')",
        }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-destructive/10 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative">
          <div className="gradient-card rounded-2xl border border-destructive/30 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/20 mb-4">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-6">
              Your registration was not approved. Please contact the gym administration.
            </p>
            <Button onClick={logout} variant="outline">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen [&_.text-foreground]:!text-white [&_.text-muted-foreground]:!text-white/75 bg-center bg-cover bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.72)), url('/bg.jpg')",
      }}
    >
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">GymGuard</h1>
              <p className="text-xs text-muted-foreground">Member Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/40">
              <User className="w-3.5 h-3.5 text-cyan-300" />
              <span className="text-sm text-white font-medium">Member</span>
            </div>
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={logout}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {shouldShowExpiryReminder && (
          <div className="mb-6 rounded-xl border border-yellow-400/40 bg-yellow-500/15 p-4">
            <div className="flex items-start gap-3">
              <BellRing className="mt-0.5 h-5 w-5 text-yellow-300" />
              <div>
                <p className="font-semibold text-white">Membership Reminder</p>
                <p className="text-sm text-white/85">
                  Your subscription ends tomorrow. Renew it to avoid access interruption.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Welcome Card */}
        <div className="gradient-card rounded-xl border border-border/50 p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full gradient-accent flex items-center justify-center">
              <User className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Welcome, {user?.name}</h2>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
            {hasActiveMembership && (
              <div className="ml-auto">
                <Badge className="bg-cyan-400/20 text-cyan-300 border-0 px-3 py-1">
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  Active Member
                </Badge>
              </div>
            )}
            {membership && isExpired && (
              <div className="ml-auto">
                <Badge variant="destructive" className="px-3 py-1">
                  <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                  Membership Expired
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Membership Info */}
        <div className="gradient-card rounded-xl border border-border/50 p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-300" />
            Membership Details
          </h2>
          
          {isLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : membership ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-background/50 rounded-lg p-4 border border-border/30">
                <p className="text-sm text-muted-foreground mb-1">Start Date</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatDate(membership.start_date)}
                </p>
              </div>
              <div className="bg-background/50 rounded-lg p-4 border border-border/30">
                <p className="text-sm text-muted-foreground mb-1">Expiry Date</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatDate(membership.expiry_date)}
                </p>
              </div>
              <div className={`rounded-lg p-4 border ${
                isExpired 
                  ? "bg-destructive/10 border-destructive/30" 
                  : isExpiringSoon 
                    ? "bg-yellow-500/10 border-yellow-500/30"
                    : "bg-cyan-400/10 border-cyan-300/40"
              }`}>
                <p className="text-sm text-muted-foreground mb-1">Days Remaining</p>
                <p className={`text-lg font-semibold ${
                  isExpired 
                    ? "text-destructive" 
                    : isExpiringSoon 
                      ? "text-yellow-500"
                      : "text-cyan-300"
                }`}>
                  {isExpired ? "Expired" : daysRemaining !== null ? `${daysRemaining} days` : "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
              <p>No membership information found.</p>
              <p className="text-sm">Please contact the gym administration.</p>
            </div>
          )}
        </div>

        {/* Access Logs */}
        <div className="gradient-card rounded-xl border border-border/50 overflow-hidden">
          <div className="p-6 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-300" />
              Your Access History
            </h2>
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : accessLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p>No access logs yet</p>
              <p className="text-sm mt-1">Your gym entries will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessLogs.map((log) => (
                  <TableRow key={log.id} className="border-border/50">
                    <TableCell className="font-medium text-white">
                      {formatDateTime(log.entry_time)}
                    </TableCell>
                    <TableCell className="text-white">
                      <Badge
                        variant={log.status === "Authorized" ? "default" : "destructive"}
                        className={log.status === "Authorized" ? "bg-cyan-400/20 text-cyan-300 border-0" : ""}
                      >
                        {log.status === "Authorized" ? (
                          <CheckCircle className="w-3 h-3 mr-1" />
                        ) : (
                          <XCircle className="w-3 h-3 mr-1" />
                        )}
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
