import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PlaybackProvider } from "./context/PlaybackContext";
import { NavBar } from "./components/layout/NavBar";
import { ActivityPing } from "./components/layout/ActivityPing";
import { InstallBanner } from "./components/layout/InstallBanner";
import { VerifyEmailBanner } from "./components/layout/VerifyEmailBanner";
import { SiteFooter } from "./components/layout/SiteFooter";
import { NowPlayingBar } from "./components/layout/NowPlayingBar";
import { ProtectedRoute } from "./components/common/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { FeedPage } from "./pages/FeedPage";
import { ProfilePage } from "./pages/ProfilePage";
import { FriendsPage } from "./pages/FriendsPage";
import { GroupsPage } from "./pages/GroupsPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { SearchPage } from "./pages/SearchPage";
import { TasksPage } from "./pages/TasksPage";
import { MessagesPage } from "./pages/MessagesPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LivePage } from "./pages/LivePage";
import { LiveRoomPage } from "./pages/LiveRoomPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { AboutPage } from "./pages/AboutPage";
import { BlogEntryPage } from "./pages/BlogEntryPage";
import { BulletinsPage } from "./pages/BulletinsPage";
import { BlogEditorPage } from "./pages/BlogEditorPage";
import { PostPage } from "./pages/PostPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { usePageTitle } from "./lib/usePageTitle";

export default function App() {
  usePageTitle();
  return (
    <AuthProvider>
      <PlaybackProvider>
        <NavBar />
        <ActivityPing />
        <InstallBanner />
        <VerifyEmailBanner />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/join/:code" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<FeedPage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/posts/:id" element={<PostPage />} />
            <Route path="/bulletins" element={<BulletinsPage />} />
            <Route path="/blog/new" element={<BlogEditorPage />} />
            <Route path="/blog/:id" element={<BlogEntryPage />} />
            <Route path="/blog/:id/edit" element={<BlogEditorPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/live/:id" element={<LiveRoomPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:username" element={<MessagesPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/:id" element={<GroupDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/help-wanted" element={<TasksPage />} />
            <Route path="/tasks" element={<Navigate to="/help-wanted" replace />} />
          </Route>

          <Route path="/u/:username" element={<ProfilePage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <SiteFooter />
        <NowPlayingBar />
      </PlaybackProvider>
    </AuthProvider>
  );
}
