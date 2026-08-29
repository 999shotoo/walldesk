
import Header from "@/components/headercontrol";
import { AppBoot } from "@/components/common/app_boot";
import { UpdatePill } from "@/components/common/update_pill";
import { PageTransitionProvider } from "@/components/common/page_transition";
import { Toaster } from "@/components/ui/toast";


export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <>
      <AppBoot />
      {/* Outside Header, and outside the transition provider: toasts are raised
          by actions that navigate (deleting a file leaves its detail page) and by
          the stores during boot, so the viewport has to outlive any one page and
          must not be caught by the cross-fade. Its own manager lives in
          lib/toast.ts, so nothing needs to be inside this element to use it. */}
      <Toaster />
      {/* Same reasoning as the toaster: the update pill must outlive page
          navigation, and stays put while the cross-fade runs. It renders
          nothing unless the splash-time update check found a new version. */}
      <UpdatePill />
      {/* Inside Header on purpose, so the cross-fade covers the page content and
          leaves the sidebar and title bar alone — the provider fades its own
          wrapper element, which lives here.

          Sidebar links still transition despite sitting above this provider:
          `auto` mode delegates clicks from the document, so it catches every
          anchor on the page regardless of where it is in the React tree. */}
      <Header>
        <PageTransitionProvider>
          {children}
        </PageTransitionProvider>
      </Header>
    </>
  );
}
