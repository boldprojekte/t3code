import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";

import type { PiSettings, ServerProvider } from "@t3tools/contracts";
import { Effect, Equal, Layer, Stream } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import { buildServerProvider } from "../providerSnapshot.ts";
import { loadPiSdkModule, PiSdkLoadError, resolvePiSdkEntryPath } from "../piSdkSpike.ts";
import { PiProvider } from "../Services/PiProvider.ts";

const PROVIDER = "pi" as const;
const PI_PACKAGE_NAME = "@mariozechner/pi-coding-agent";

function normalizePackageEntryPath(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function findPiPackageVersion(entryPath: string): Promise<string | null> {
  let currentDirectory = nodePath.dirname(entryPath);
  const root = nodePath.parse(currentDirectory).root;

  while (currentDirectory !== root) {
    const packageJsonPath = nodePath.join(currentDirectory, "package.json");
    try {
      const parsed = JSON.parse(await nodeFs.readFile(packageJsonPath, "utf8")) as {
        readonly name?: unknown;
        readonly version?: unknown;
      };
      if (parsed.name === PI_PACKAGE_NAME && typeof parsed.version === "string") {
        return parsed.version;
      }
    } catch {
      // Keep walking up until the package root is found.
    }

    currentDirectory = nodePath.dirname(currentDirectory);
  }

  return null;
}

function makeInitialPiProvider(piSettings: PiSettings): ServerProvider {
  const checkedAt = new Date().toISOString();

  if (!piSettings.enabled) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: false,
      checkedAt,
      models: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Pi is disabled in T3 Code settings.",
      },
    });
  }

  return buildServerProvider({
    provider: PROVIDER,
    enabled: true,
    checkedAt,
    models: [],
    probe: {
      installed: true,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: "Checking Pi SDK availability...",
    },
  });
}

export function formatPiProviderLoadError(error: unknown): {
  readonly installed: boolean;
  readonly message: string;
} {
  if (error instanceof PiSdkLoadError) {
    return {
      installed: false,
      message:
        "Pi SDK is not installed or could not be loaded. Install @mariozechner/pi-coding-agent or set PI_CODING_AGENT_PACKAGE_PATH.",
    };
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      installed: true,
      message: `Pi SDK is present but has an unsupported shape: ${error.message}`,
    };
  }

  return {
    installed: true,
    message: "Pi SDK is present but could not be validated.",
  };
}

export const checkPiProviderStatus = (
  piSettings: PiSettings,
  dependencies?: {
    readonly resolveEntryPath?: (packageEntryPath?: string) => Promise<string>;
    readonly loadSdk?: (packageEntryPath?: string) => Promise<unknown>;
    readonly readVersion?: (entryPath: string) => Promise<string | null>;
  },
): Effect.Effect<ServerProvider> => {
  const checkedAt = new Date().toISOString();
  if (!piSettings.enabled) {
    return Effect.succeed(makeInitialPiProvider(piSettings));
  }

  return Effect.tryPromise(async () => {
    const packageEntryPath = normalizePackageEntryPath(piSettings.packageEntryPath);
    const resolvedEntryPath = await (dependencies?.resolveEntryPath ?? resolvePiSdkEntryPath)(
      packageEntryPath,
    );
    await (
      dependencies?.loadSdk ??
      ((nextPackageEntryPath?: string) =>
        loadPiSdkModule({
          ...(nextPackageEntryPath ? { packageEntryPath: nextPackageEntryPath } : {}),
        }))
    )(packageEntryPath);
    const version = await (dependencies?.readVersion ?? findPiPackageVersion)(resolvedEntryPath);

    return buildServerProvider({
      provider: PROVIDER,
      enabled: true,
      checkedAt,
      models: [],
      probe: {
        installed: true,
        version,
        status: "ready",
        auth: { status: "unknown" },
        message:
          "Pi SDK is available. Model and command inventory will be loaded by the runtime integration path.",
      },
    });
  }).pipe(
    Effect.catch((error: unknown) => {
      const formatted = formatPiProviderLoadError(error);
      return Effect.succeed(
        buildServerProvider({
          provider: PROVIDER,
          enabled: true,
          checkedAt,
          models: [],
          probe: {
            installed: formatted.installed,
            version: null,
            status: "error",
            auth: { status: "unknown" },
            message: formatted.message,
          },
        }),
      );
    }),
  );
};

export const PiProviderLive = Layer.effect(
  PiProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const getProviderSettings = serverSettings.getSettings.pipe(
      Effect.map((settings) => settings.providers.pi),
    );

    return yield* makeManagedServerProvider({
      getSettings: getProviderSettings.pipe(Effect.orDie),
      streamSettings: serverSettings.streamChanges.pipe(
        Stream.map((settings) => settings.providers.pi),
      ),
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      initialSnapshot: makeInitialPiProvider,
      checkProvider: getProviderSettings.pipe(
        Effect.flatMap((settings) => checkPiProviderStatus(settings)),
      ),
      refreshInterval: "5 minutes",
    });
  }),
);
