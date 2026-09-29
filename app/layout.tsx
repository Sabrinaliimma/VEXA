import type { Metadata } from "next";
import "./globals.css";
import "./vexa.css";
export const metadata: Metadata = {
  title: "Vexa | Central de atendimento",
  description: "Acompanhe chamados, responsáveis e prazos em uma central de atendimento.",
  icons: { icon: "/favicon.svg?v=3", shortcut: "/favicon.svg?v=3" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
