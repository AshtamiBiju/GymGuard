import { useAuth } from "@/react-app/context/AuthContext";
import AdminDashboard from "@/react-app/pages/AdminDashboard";
import MemberDashboard from "@/react-app/pages/MemberDashboard";

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === "admin") {
    return <AdminDashboard />;
  }

  return <MemberDashboard />;
}
