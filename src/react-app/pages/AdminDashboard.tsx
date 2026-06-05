import { useState, useEffect } from "react";
import { useAuth } from "@/react-app/context/AuthContext";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import { Badge } from "@/react-app/components/ui/badge";
import { 
  Dumbbell, 
  LogOut, 
  Users, 
  ClipboardList, 
  Clock,
  Shield,
  Check,
  X,
  Calendar,
  RefreshCw,
  Trash2
} from "lucide-react";

interface Member {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  start_date: string | null;
  expiry_date: string | null;
}

interface AccessLog {
  id: number;
  user_id: number;
  name: string;
  email: string;
  entry_time: string;
  status: string;
}

interface Stats {
  totalMembers: number;
  pendingApprovals: number;
  todayEntries: number;
}

export default function AdminDashboard() {
  const { user, logout, token } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalMembers: 0, pendingApprovals: 0, todayEntries: 0 });
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [activeTab, setActiveTab] = useState<"pending" | "members" | "logs">("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, pendingRes, membersRes, logsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers }),
        fetch("/api/admin/pending", { headers }),
        fetch("/api/admin/members", { headers }),
        fetch("/api/admin/access-logs", { headers }),
      ]);

      const statsData = await statsRes.json();
      const pendingData = await pendingRes.json();
      const membersData = await membersRes.json();
      const logsData = await logsRes.json();

      setStats(statsData);
      setPendingMembers(pendingData.pending || []);
      setAllMembers(membersData.members || []);
      setAccessLogs(logsData.logs || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (id: number) => {
    await fetch(`/api/admin/approve/${id}`, { method: "POST", headers });
    fetchData();
  };

  const handleReject = async (id: number) => {
    await fetch(`/api/admin/reject/${id}`, { method: "POST", headers });
    fetchData();
  };

  const handleUpdateMembership = async () => {
    if (!editMember || !newExpiryDate) return;
    
    await fetch(`/api/admin/membership/${editMember.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiry_date: newExpiryDate }),
    });
    
    setEditMember(null);
    setNewExpiryDate("");
    fetchData();
  };

  const handleDeleteMember = async (id: number, name: string) => {
    const confirmed = window.confirm(`Delete member "${name}"? This action cannot be undone.`);
    if (!confirmed) return;

    const response = await fetch(`/api/admin/members/${id}`, { method: "DELETE", headers });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      window.alert(errorData.error || "Failed to delete member.");
      return;
    }

    // Optimistic update for immediate UI feedback; fetchData keeps server state in sync.
    setAllMembers((prev) => prev.filter((member) => member.id !== id));
    setPendingMembers((prev) => prev.filter((member) => member.id !== id));
    setAccessLogs((prev) => prev.filter((log) => log.user_id !== id));
    fetchData();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const parseDateOnly = (dateStr: string) => {
    const normalizedDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    return new Date(`${normalizedDate}T00:00:00`);
  };

  const getStartOfToday = () => parseDateOnly(new Date().toISOString());

  const isMembershipExpired = (member: Member) => {
    if (!member.expiry_date) return false;
    return parseDateOnly(member.expiry_date) < getStartOfToday();
  };

  const approvedMembers = allMembers.filter((member) => member.status === "approved");
  const activeMembersCount = approvedMembers.filter((member) => !isMembershipExpired(member)).length;

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
              <p className="text-xs text-muted-foreground">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-400/15 border border-cyan-300/40">
              <Shield className="w-3.5 h-3.5 text-cyan-300" />
              <span className="text-sm text-cyan-300 font-medium">Admin</span>
            </div>
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
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
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="gradient-card rounded-xl border border-border/50 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeMembersCount}</p>
                <p className="text-sm text-muted-foreground">Active Members</p>
              </div>
            </div>
          </div>
          <div className="gradient-card rounded-xl border border-border/50 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.pendingApprovals}</p>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
              </div>
            </div>
          </div>
          <div className="gradient-card rounded-xl border border-border/50 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.todayEntries}</p>
                <p className="text-sm text-muted-foreground">Today's Entries</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "pending" ? "default" : "ghost"}
            onClick={() => setActiveTab("pending")}
            className={
              activeTab === "pending"
                ? "gradient-accent !text-white hover:opacity-90"
                : "!text-white/80 hover:!text-white hover:bg-white/10"
            }
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            Pending ({pendingMembers.length})
          </Button>
          <Button
            variant={activeTab === "members" ? "default" : "ghost"}
            onClick={() => setActiveTab("members")}
            className={
              activeTab === "members"
                ? "gradient-accent !text-white hover:opacity-90"
                : "!text-white/80 hover:!text-white hover:bg-white/10"
            }
          >
            <Users className="w-4 h-4 mr-2" />
            All Members
          </Button>
          <Button
            variant={activeTab === "logs" ? "default" : "ghost"}
            onClick={() => setActiveTab("logs")}
            className={
              activeTab === "logs"
                ? "gradient-accent !text-white hover:opacity-90"
                : "!text-white/80 hover:!text-white hover:bg-white/10"
            }
          >
            <Clock className="w-4 h-4 mr-2" />
            Access Logs
          </Button>
          <Button
            variant="ghost"
            onClick={fetchData}
            disabled={isLoading}
            className="!text-white/80 hover:!text-white hover:bg-white/10"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Content */}
        <div className="gradient-card rounded-xl border border-border/50 overflow-hidden">
          {activeTab === "pending" && (
            <>
              {pendingMembers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No pending registrations
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingMembers.map((member) => (
                      <TableRow key={member.id} className="border-border/50">
                        <TableCell className="font-medium text-white">{member.name}</TableCell>
                        <TableCell className="text-white">{member.email}</TableCell>
                        <TableCell className="text-white">{member.phone}</TableCell>
                        <TableCell className="text-white">{formatDate(member.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(member.id)}
                              className="bg-primary/20 text-primary hover:bg-primary/30"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(member.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {activeTab === "members" && (
            <>
              {approvedMembers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No members found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedMembers.map((member) => {
                      const isExpired = isMembershipExpired(member);

                      return (
                      <TableRow
                        key={member.id}
                        className={isExpired ? "border-border/50 bg-white/5 text-white/55" : "border-border/50 text-white"}
                      >
                        <TableCell className="font-medium text-white">{member.name}</TableCell>
                        <TableCell className="text-white">{member.email}</TableCell>
                        <TableCell className="text-white">
                          <Badge
                            className={
                              isExpired
                                ? "bg-white/10 !text-white/70 border border-white/15"
                                : "bg-primary/20 !text-white"
                            }
                          >
                            {isExpired ? "expired" : member.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={isExpired ? "text-white/60" : "text-white"}>{formatDate(member.start_date)}</TableCell>
                        <TableCell className={isExpired ? "text-white/60" : "text-white"}>{formatDate(member.expiry_date)}</TableCell>
                        <TableCell className={isExpired ? "text-right text-white/60" : "text-right text-white"}>
                          <div className="flex justify-end gap-2">
                            {member.status === "approved" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className={isExpired ? "!text-white/60 hover:bg-white/10" : "!text-white hover:bg-white/10"}
                                onClick={() => {
                                  setEditMember(member);
                                  setNewExpiryDate(member.expiry_date || "");
                                }}
                              >
                                <Calendar className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteMember(member.id, member.name)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {activeTab === "logs" && (
            <>
              {accessLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No access logs yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead>Member</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Entry Time</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessLogs.map((log) => (
                      <TableRow key={log.id} className="border-border/50">
                        <TableCell className="font-medium text-white">{log.name}</TableCell>
                        <TableCell className="text-white">{log.email}</TableCell>
                        <TableCell className="text-white">{formatDateTime(log.entry_time)}</TableCell>
                        <TableCell className="text-white">
                          <Badge
                            variant={log.status === "Authorized" ? "default" : "destructive"}
                            className={log.status === "Authorized" ? "bg-primary/20 text-primary" : ""}
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </div>
      </main>

      {/* Edit Membership Dialog */}
      <Dialog open={!!editMember} onOpenChange={() => setEditMember(null)}>
        <DialogContent className="gradient-card border-border/50">
          <DialogHeader>
            <DialogTitle>Update Membership</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Member</p>
              <p className="font-medium">{editMember?.name}</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                New Expiry Date
              </label>
              <Input
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditMember(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateMembership} className="gradient-accent">
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
