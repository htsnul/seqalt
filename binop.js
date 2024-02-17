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

function parseSequence(tokens, i, isArray) {
  const exprs = [];
  while (i < tokens.length && tokens[i].type !== "SequenceEnd") {
    const result = parseExpr(tokens, i);
    i = result.i;
    exprs.push(result.expr);
  }
  return { i, expr: { type: "Sequence", exprs, isArray } };
}

function parseExpr(tokens, i) {
  const token = tokens[i];
  if (token.type === "SequenceStart") {
    const result = parseSequence(tokens, i + 1, token.string === "[");
    console.assert(tokens[result.i].type === "SequenceEnd");
    return { i: result.i + 1, expr: result.expr };
  }
  if (token.type === "Number") {
    return { i: i + 1, expr: { type: "Number", value: Number(token.string) } };
  }
  if (token.type === "String") {
    return { i: i + 1, expr: { type: "String", value: token.string } };
  }
  if (token.type === "Symbol") {
    return { i: i + 1, expr: { type: "Symbol", value: token.string } };
  }
}

function parse(tokens) { return parseSequence(tokens, 0).expr; }

function applyUserFunc(func, l, r) {
  const env = { parentEnv: func.env, args: { l, r } };
  const val = evalExpr(env, func.expr);
  return val;
}

function applyFunc(env, func, l, rExpr) {
  if (typeof func === "function") return func(env, l, rExpr);
  if (typeof func === "object") return applyUserFunc(func, l, evalExpr(env, rExpr));
}

function evalSequenceExpr(env, expr) {
  if (expr.exprs.length === 0) return expr.isArray ? [] : undefined;
  let val = evalExpr(env, expr.exprs[0]);
  if (expr.isArray) val = [val];
  for (let i = 1; i < expr.exprs.length;) {
    const func = evalExpr(env, expr.exprs[i++]);
    const rExpr = expr.exprs[i++] ?? { type: "Null" };
    val = applyFunc(env, func, val, rExpr);
  }
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
  for (let e = env; e; e = e.parentEnv) {
    if (name in e) return e;
  }
}

function envVal(env, name) { return ownerEnv(env, name)[name]; }

function addGlobalVals(env) {
  env["@"] = null;
  env["_"] = null;
  env["#"] = (env, l, rExpr) => l;
  env[";"] = (env, l, rExpr) => evalExpr(env, rExpr);
  env["+"] = (env, l, rExpr) => l + evalExpr(env, rExpr);
  env["-"] = (env, l, rExpr) => l - evalExpr(env, rExpr);
  env["*"] = (env, l, rExpr) => l * evalExpr(env, rExpr);
  env["=="] = (env, l, rExpr) => l === evalExpr(env, rExpr);
  env["!="] = (env, l, rExpr) => l !== evalExpr(env, rExpr);
  env["<"] = (env, l, rExpr) => l < evalExpr(env, rExpr);
  env["<="] = (env, l, rExpr) => l <= evalExpr(env, rExpr);
  env[">"] = (env, l, rExpr) => l > evalExpr(env, rExpr);
  env[">="] = (env, l, rExpr) => l >= evalExpr(env, rExpr);
  env["var"] = (env, l, rExpr) => {
    const name = evalExpr(env, rExpr);
    env[name] = null;
    return name;
  };
  env["="] = (env, l, rExpr) => {
    if (l instanceof Array) {
      console.assert(l.length === 2);
      const [obj, key] = l;
      return obj[key] = evalExpr(env, rExpr);
    }
    const name = l;
    const e = ownerEnv(env, name) ?? env;
    return e[name] = evalExpr(env, rExpr);
  };
  env["."] = (env, l, rExpr) => {
    return l[rExpr.type === "Symbol" ? rExpr.value : evalExpr(env, rExpr)];
  };
  env[","] = (env, l, rExpr) => {
    const r = evalExpr(env, rExpr);
    if (l instanceof Array) return [...l, r];
    if (typeof l === "object" && typeof r === "object") return { ...l, ...r };
    return [l, r];
  };
  env["&&"] = (env, l, rExpr) => l && evalExpr(env, rExpr);
  env["||"] = (env, l, rExpr) => l || evalExpr(env, rExpr);
  env["?"] = (env, l, rExpr) => {
    return Boolean(l) && { value: evalExpr(env, rExpr) };
  };
  env[":"] = (env, l, rExpr) => {
    if (typeof l === "object") return l.value;
    if (l === false) return evalExpr(env, rExpr);
    if (typeof l === "string") return { [l]: evalExpr(env, rExpr) };
  };
  env["=>"] = (env, l, rExpr) => ({ env, expr: rExpr });
  env["length"] = (env, l, rExpr) => evalExpr(env, rExpr).length;
  env["map"] = (env, l, rExpr) => l.map(
    (v) => applyUserFunc(evalExpr(env, rExpr), undefined, v)
  );
  env["forEach"] = env["map"];
  env["print"] = (env, l, rExpr) => {
    log(l ?? evalExpr(env, rExpr));
    return undefined;
  };
}

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  const env = {};
  addGlobalVals(env);
  return evalExpr(env, expr);
}
