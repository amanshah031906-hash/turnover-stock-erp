import { Archivo, Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-archivo",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Turn,Over. — Stock & Design ERP",
  description: "Internal raw material + design (BOM) stock management system.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${inter.variable}`}>
        <Nav />
        <main className="main">{children}</main>
        <footer className="foot">
          © 2026 Turn,Over. — Internal stock &amp; design system. Not a public storefront.
        </footer>
      </body>
    </html>
  );
}
