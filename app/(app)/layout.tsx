
import Header from "@/components/headercontrol";
import { AppBoot } from "@/components/common/app_boot";


export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <>
      <AppBoot />
      <Header>
        {children}
      </Header>
    </>
  );
}
