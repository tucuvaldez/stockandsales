const readline = require("readline");

// Una sola interfaz con cola de líneas: con entrada redirigida (pipes) no se pierde ninguna respuesta.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
rl.setPrompt("");
const lines = [];
const waiting = [];
let closed = false;
let muted = false;

rl._writeToOutput = function (s) {
  if (!muted) return rl.output.write(s);
  if (s.includes("\n") || s.includes("\r")) rl.output.write("\n");
  else rl.output.write("*".repeat(s.length));
};
rl.on("line", (line) => {
  if (waiting.length) waiting.shift()(line);
  else lines.push(line);
});
rl.on("close", () => {
  closed = true;
  while (waiting.length) waiting.shift()(null);
});

function nextLine(prompt, hidden = false) {
  process.stdout.write(prompt);
  if (lines.length) {
    const l = lines.shift();
    if (!process.stdin.isTTY) process.stdout.write("\n");
    return Promise.resolve(l);
  }
  if (closed) return Promise.reject(new Error("Se cerró la entrada antes de completar los datos"));
  muted = hidden && !!process.stdin.isTTY;
  return new Promise((resolve, reject) =>
    waiting.push((l) => {
      muted = false;
      if (l === null) reject(new Error("Se cerró la entrada antes de completar los datos"));
      else resolve(l);
    })
  );
}

async function ask(question, fallback = "") {
  const a = (await nextLine(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim();
  return a || fallback;
}

async function askHidden(question) {
  return (await nextLine(`${question}: `, true)).trim();
}

async function askChoice(question, options) {
  for (;;) {
    const a = await ask(`${question} (${options.join("/")})`);
    if (options.includes(a.toLowerCase())) return a.toLowerCase();
    console.log("  Opción inválida.");
  }
}

async function askNewSecret(label, validate) {
  for (;;) {
    const a = await askHidden(label);
    const err = validate(a);
    if (err) { console.log(`  ${err}`); continue; }
    const b = await askHidden("  Repetila para confirmar");
    if (a === b) return a;
    console.log("  No coinciden. Probá de nuevo.");
  }
}

const close = () => rl.close();
const title = (t) => console.log(`\n==========================================\n  ${t}\n==========================================\n`);

module.exports = { ask, askHidden, askChoice, askNewSecret, close, title };
