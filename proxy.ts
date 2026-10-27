import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const AUTH_PAGES = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/nouveau-mot-de-passe"];

// Redirection rapide sur la seule absence du cookie ; la session est vérifiée côté serveur
// dans chaque page et action (les pages de connexion redirigent elles-mêmes si la session est valide).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!AUTH_PAGES.includes(pathname) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|mawnytrack-icon.svg|manifest.webmanifest|favicon.ico|robots.txt).*)"],
};
