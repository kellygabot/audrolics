import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultModel } from "../../app/builder/builder-model";

vi.mock("@/lib/session", () => ({ currentAccountId: () => "account-1" }));
import { readRecoveryModel, recoveryKey } from "../../app/builder/builder-recovery";

describe("builder recovery", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  it("reads only a valid draft from the current account key", () => {
    window.localStorage.setItem("audrolics.builder.recovery.other", JSON.stringify(defaultModel()));
    expect(readRecoveryModel()).toBeNull();
    const draft = { ...defaultModel(), name: "Recovered" };
    window.localStorage.setItem(recoveryKey(), JSON.stringify(draft));
    expect(readRecoveryModel()?.name).toBe("Recovered");
  });

  it("discards malformed JSON without affecting other drafts", () => {
    window.localStorage.setItem(recoveryKey(), "{");
    window.localStorage.setItem("audrolics.builder.recovery.other", "other account");
    expect(readRecoveryModel()).toBeNull();
    expect(window.localStorage.getItem(recoveryKey())).toBeNull();
    expect(window.localStorage.getItem("audrolics.builder.recovery.other")).toBe("other account");
  });
});
