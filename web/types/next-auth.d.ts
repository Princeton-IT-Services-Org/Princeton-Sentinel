import "next-auth";

declare module "next-auth" {
  interface Session {
    groups?: string[];
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      oid?: string;
      upn?: string;
      groups?: string[];
    };
  }
}
