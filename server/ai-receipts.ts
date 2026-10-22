import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { WorkspaceError } from "./errors.ts";
// Per-server signing key: no provider credential, source text, or durable draft storage.
export class AiReceipts {
  private key = randomBytes(32);
  issue(scope: string, value: unknown) {
    const body = Buffer.from(
      JSON.stringify({
        scope,
        hash: this.hash(value),
        expires: Date.now() + 60 * 60 * 1000,
      }),
    ).toString("base64url");
    return body + "." + this.sign(body);
  }
  method(
    receipt: string | undefined,
    scope: string,
    value: unknown,
  ): "user" | "ai_suggested" | "ai_then_edited" {
    if (!receipt) return "user";
    try {
      const [body, signature, ...extra] = receipt.split(".");
      const expected = Buffer.from(this.sign(body));
      const actual = Buffer.from(signature ?? "");
      if (
        extra.length ||
        actual.length !== expected.length ||
        !timingSafeEqual(expected, actual)
      )
        throw Error();
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      if (payload.scope !== scope || payload.expires < Date.now())
        throw Error();
      return payload.hash === this.hash(value)
        ? "ai_suggested"
        : "ai_then_edited";
    } catch {
      throw new WorkspaceError(
        409,
        "AI draft receipt expired or does not match this approval. Request a new draft or explicitly continue as a manual draft. Your edits are unchanged.",
      );
    }
  }
  private hash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  private sign(body: string) {
    return createHmac("sha256", this.key).update(body).digest("base64url");
  }
}
export const insightValue = (value: {
  title: string;
  summary: string;
  takeaways: string[];
  seeds: string[];
  themes?: string[];
}) => ({
  title: value.title,
  summary: value.summary,
  takeaways: value.takeaways,
  seeds: [...value.seeds].sort(),
  themes: [...(value.themes ?? [])].sort(),
});
export const synthesisScope = (ids: string[]) =>
  "synthesis:" +
  ids
    .map((id) => id.toLowerCase())
    .sort()
    .join(",");
export const connectionScope = (a: string, b: string, relationship: string) =>
  `connection:${a.toLowerCase()}:${b.toLowerCase()}:${relationship}`;
