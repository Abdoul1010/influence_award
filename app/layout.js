import "./globals.css";

export const metadata = {
  title: "INFLUENCE AWARD",
  description:
    "Votez pour les jeunes talents et acteurs influents de la région de Dosso.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
