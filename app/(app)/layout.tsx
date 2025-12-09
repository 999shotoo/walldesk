
import Header from "@/components/headercontrol";


export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <>
      <Header>
        {children}
      </Header>
    </>
  );
}
