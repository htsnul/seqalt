function tokenize(str) {
  const tokens = [];
  for (let i = 0; i < str.length;) {
    let r;
    if (["(", "[", "{"].includes(str[i])) {
      tokens.push({ type: "SequenceStart", string: str[i++] });
    } else if ([")", "]", "}"].includes(str[i])) {
      tokens.push({ type: "SequenceEnd", string: str[i++] });
    } else if (r = str.slice(i).match(/^\d+/)) {
      tokens.push({ type: "Number", string: r[0] });
      i += r[0].length;
    } else if (r = str.slice(i).match(/^"((\\.|[^"])*)"/)) {
      tokens.push({ type: "String", string: r[1].replace(/\\./g, (s) => s[1]) });
      i += r[0].length;
    } else if (r = str.slice(i).match(/^[A-Za-z_]\w*|^[^\w\s\(\)\[\]{}"]+/)) {
      tokens.push({ type: "Symbol", string: r[0] });
      i += r[0].length;
    } else ++i;
  }
  return tokens;
}

function parseSequence(tokens, i, subtype) {
  const exprs = [];
  while (i < tokens.length && tokens[i].type !== "SequenceEnd") {
    const result = parseExpr(tokens, i);
    i = result.i;
    exprs.push(result.expr);
  }
  return { i, expr: { type: "Sequence", subtype, exprs } };
}

function parseExpr(tokens, i) {
  const token = tokens[i];
  if (token.type === "SequenceStart") {
    const result = parseSequence(tokens, i + 1, token.string);
    console.assert(tokens[result.i].type === "SequenceEnd");
    return { i: result.i + 1, expr: result.expr };
  }
  if (token.type === "Number")
    return { i: i + 1, expr: { type: "Number", value: Number(token.string) } };
  if (token.type === "String")
    return { i: i + 1, expr: { type: "String", value: token.string } };
  if (token.type === "Symbol")
    return { i: i + 1, expr: { type: "Symbol", value: token.string } };
}

function parse(tokens) { return parseSequence(tokens, 0).expr; }

function callUserFunc(func, l, r) {
  const env = { __parentEnv: func.env, args: { l, r } };
  if (Array.isArray(r)) func.argNames.forEach((name, i) => env[name] = r[i]);
  else env[func.argNames[0]] = r;
  const val = evalExpr(env, func.expr);
  return val;
}

function callFunc(env, func, l, rExpr) {
  if (typeof func === "function") return func(env, l, rExpr);
  if (typeof func === "object") return callUserFunc(func, l, evalExpr(env, rExpr));
}

function evalSequenceExpr(env, expr) {
  if (expr.exprs.length === 0) return expr.subtype === "[" ? [] : undefined;
  let val = evalExpr(env, expr.exprs[0]);
  if (expr.subtype === "[") val = [val];
  for (let i = 1; i < expr.exprs.length;) {
    const func = evalExpr(env, expr.exprs[i++]);
    const rExpr = expr.exprs[i++] ?? { type: "Null" };
    val = callFunc(env, func, val, rExpr);
  }
  if (expr.subtype === "{" && typeof val === "object") delete val.__isDicUnderConstruction;
  return val;
}

function evalExpr(env, expr) {
  if (expr.type === "Sequence") return evalSequenceExpr(env, expr);
  if (expr.type === "Number") return expr.value;
  if (expr.type === "String") return expr.value;
  if (expr.type === "Symbol") return envVal(env, expr.value);
  if (expr.type === "Null") return undefined;
}

function ownerEnv(env, name) {
  return (!env || name in env) ? env : ownerEnv(env.__parentEnv, name);
}

function envVal(env, name) { return ownerEnv(env, name)[name]; }

function createRootEnv() {
  const rootEnv = {};
  rootEnv["@"] = null;
  rootEnv["rem"] = (env, l, rExpr) => l;
  rootEnv[";"] = (env, l, rExpr) => evalExpr(env, rExpr);
  rootEnv["+"] = (env, l, rExpr) => l + evalExpr(env, rExpr);
  rootEnv["-"] = (env, l, rExpr) => l - evalExpr(env, rExpr);
  rootEnv["*"] = (env, l, rExpr) => l * evalExpr(env, rExpr);
  rootEnv["=="] = (env, l, rExpr) => l === evalExpr(env, rExpr);
  rootEnv["!="] = (env, l, rExpr) => l !== evalExpr(env, rExpr);
  rootEnv["<"] = (env, l, rExpr) => l < evalExpr(env, rExpr);
  rootEnv["<="] = (env, l, rExpr) => l <= evalExpr(env, rExpr);
  rootEnv[">"] = (env, l, rExpr) => l > evalExpr(env, rExpr);
  rootEnv[">="] = (env, l, rExpr) => l >= evalExpr(env, rExpr);
  rootEnv["var"] = (env, l, rExpr) => {
    const name = evalExpr(env, rExpr);
    env[name] = null;
    return name;
  };
  rootEnv["="] = (env, l, rExpr) => {
    if (l instanceof Array) {
      console.assert(l.length === 2);
      const [obj, key] = l;
      return obj[key] = evalExpr(env, rExpr);
    }
    const name = l;
    const e = ownerEnv(env, name) ?? rootEnv;
    return e[name] = evalExpr(env, rExpr);
  };
  rootEnv["."] = (env, l, rExpr) => {
    return l[rExpr.type === "Symbol" ? rExpr.value : evalExpr(env, rExpr)];
  };
  rootEnv[","] = (env, l, rExpr) => {
    if (l?.__isDicUnderConstruction) return { ...l, __tmpKey: evalExpr(env, rExpr) };
    if (l instanceof Array) return [...l, evalExpr(env, rExpr)];
    return [l, evalExpr(env, rExpr)];
  };
  rootEnv["&&"] = (env, l, rExpr) => (l && evalExpr(env, rExpr));
  rootEnv["||"] = (env, l, rExpr) => (l || evalExpr(env, rExpr));
  rootEnv["?"] = (env, l, rExpr) => (Boolean(l) && { __valWhenTrue: evalExpr(env, rExpr) });
  rootEnv[":"] = (env, l, rExpr) => {
    if (l === false) return evalExpr(env, rExpr);
    if (typeof l === "object" && "__valWhenTrue" in l) return l.__valWhenTrue;
    if (typeof l === "string") return { __isDicUnderConstruction: true, [l]: evalExpr(env, rExpr) };
    if (l?.__isDicUnderConstruction) {
      const key = l.__tmpKey;
      delete l.__tmpKey;
      return { ...l, [key]: evalExpr(env, rExpr) };
    }
  };
  rootEnv["=>"] = (env, l, rExpr) => (
    { env, argNames: (Array.isArray(l) ? l : [l]), expr: rExpr }
  );
  rootEnv["range"] = (env, l, rExpr) => [...Array(evalExpr(env, rExpr))].map((_, i) => i);
  rootEnv["length"] = (env, l, rExpr) => evalExpr(env, rExpr).length;
  rootEnv["map"] = (env, l, rExpr) => {
    const func = evalExpr(env, rExpr);
    return l.map((v) => callUserFunc(func, undefined, v));
  };
  rootEnv["forEach"] = rootEnv["map"];
  rootEnv["print"] = (env, l, rExpr) => log(evalExpr(env, rExpr));
  return rootEnv;
}

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  return evalExpr(createRootEnv(), expr);
}
