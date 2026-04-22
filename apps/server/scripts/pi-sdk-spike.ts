import { createPiSessionSpike } from "../src/provider/piSdkSpike.ts";

async function main() {
  const [, , cwdArg, ...promptParts] = process.argv;
  const cwd = cwdArg && cwdArg.trim().length > 0 ? cwdArg : process.cwd();
  const prompt =
    promptParts.join(" ").trim() ||
    "List the most relevant files in this project and explain what they do.";

  const spike = await createPiSessionSpike({
    cwd,
    onEvent: (event) => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  });

  try {
    process.stdout.write(
      `${JSON.stringify({
        type: "session.info",
        cwd,
        agentDir: spike.agentDir,
        ...spike.getSessionInfo(),
      })}\n`,
    );

    const commands = await spike.getCommands();
    process.stdout.write(`${JSON.stringify({ type: "commands", commands }, null, 2)}\n`);

    await spike.prompt(prompt);
  } finally {
    await spike.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
