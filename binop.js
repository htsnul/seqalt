function tokenize(str) {
  const tokens = [];
  for (let i = 0; i < str.length;) {
    let r;
    if (["(", "[", "{"].includes(str[i])) {
      tokens.push({ type: "SequenceStart", string: str[i] });
      i++;
    } else if ([")", "]", "}"].includes(str[i])) {
      tokens.push({ type: "SequenceEnd", string: str[i] });
      i++;
    } else if (r = str.slice(i).match(/^\d+/)) {
      tokens.push({ type: "Number", string: r[0] });
      i += r[0].length;
    } else if (r = str.slice(i).match(/^"((\\.|[^"])*)"/)) {
      tokens.push({ type: "String", string: r[1].replace(/\\./g, (s) => s[1]) });
      i += r[0].length;
    } else if (r = str.slice(i).match(/^\w+|^[^\w\d\s()"]+/)) {
      tokens.push({ type: "Symbol", string: r[0] });
      i += r[0].length;
    } else ++i;
  }
  return tokens;
}

function parseSequence(tokens, i, isArray) {
  const exprs = [];
  while (i < tokens.length) {
    const result = parseExpr(tokens, i);
    if (!result) break;
    i = result.i;
    exprs.push(result.expr);
  }
  return { i, expr: { type: "Sequence", exprs, isArray } };
}

function parseExpr(tokens, i) {
  if (i >= tokens.length) return;
  const token = tokens[i];
  if (token.type === "SequenceStart") {
    i++;
    const result = parseSequence(tokens, i, token.string === "[");
    if (result) i = result.i;
    const expr = result?.expr ?? { type: "Null" };
    console.assert(tokens[i].type === "SequenceEnd");
    i++;
    return { i, expr };
  }
  if (token.type === "Number") {
    i++;
    return { i, expr: { type: "Number", value: Number(token.string) } };
  }
  if (token.type === "String") {
    i++;
    return { i, expr: { type: "String", value: token.string } };
  }
  if (token.type === "Symbol") {
    i++;
    return { i, expr: { type: "Symbol", value: token.string } };
  }
}

function parse(tokens) {
  return parseSequence(tokens, 0)?.expr ?? { type: "Null" };
}

function applyUserFunc(func, l, r) {
  env = { parentEnv: func.env, args: { l, r } };
  const val = evalExpr(func.expr);
  env = env.parentEnv;
  return val;
}

function applyFunc(func, l, rExpr) {
  if (typeof func === "function") return func(l, rExpr);
  if (typeof func === "object") return applyUserFunc(func, l, evalExpr(rExpr));
}

function evalSequenceExpr(expr) {
  if (expr.exprs.length === 0) return expr.isArray ? [] : undefined;
  let val = evalExpr(expr.exprs[0]);
  if (expr.isArray) val = [val];
  for (let i = 1; i < expr.exprs.length;) {
    const func = evalExpr(expr.exprs[i++]);
    const rExpr = expr.exprs[i++] ?? { type: "Null" };
    val = applyFunc(func, val, rExpr);
  }
  return val;
}

function evalExpr(expr) {
  if (expr.type === "Sequence") return evalSequenceExpr(expr);
  if (expr.type === "Number") return expr.value;
  if (expr.type === "String") return expr.value;
  if (expr.type === "Symbol") return envVal(expr.value);
  if (expr.type === "Null") return undefined;
}

let env = {};

function ownerEnv(name) {
  for (let e = env; e; e = e.parentEnv) {
    if (e[name] !== undefined) return e;
  }
}

function envVal(name) {
  return ownerEnv(name)[name];
}

function addGlobalVals() {
  env["@"] = null;
  env["_"] = null;
  env["+"] = (l, rExpr) => {
    if (typeof l === "object") return { ...l, ...evalExpr(rExpr) };
    return l + evalExpr(rExpr);
  };
  env["-"] = (l, rExpr) => {
    return l - evalExpr(rExpr);
  };
  env["*"] = (l, rExpr) => {
    return l * evalExpr(rExpr);
  };
  env["#"] = (l, rExpr) => l;
  env[";"] = (l, rExpr) => evalExpr(rExpr);
  env["var"] = (l, rExpr) => {
    const name = evalExpr(rExpr);
    env[name] = null;
    return name;
  };
  env["="] = (l, rExpr) => {
    if (l instanceof Array) {
      console.assert(l.length === 2);
      const [obj, key] = l;
      return obj[key] = evalExpr(rExpr);
    }
    const name = l;
    const e = ownerEnv(name) ?? env;
    return e[name] = evalExpr(rExpr);
  };
  env["$"] = (l, rExpr) => envVal(evalExpr(rExpr));
  env["."] = (l, rExpr) => l[rExpr.type === "Symbol" ? rExpr.value : evalExpr(rExpr)];
  env[","] = (l, rExpr) => {
    const r = evalExpr(rExpr);
    if (l instanceof Array) return [...l, r];
    return [l, r];
  };
  env["=>"] = (l, rExpr) => {
    return { env, expr: rExpr };
  }
  env["=="] = (l, rExpr) => {
    return l === evalExpr(rExpr);
  };
  env["<"] = (l, rExpr) => {
    return l < evalExpr(rExpr);
  };
  env["print"] = (l, rExpr) => {
    log(l ?? evalExpr(rExpr));
    return undefined;
  };
  env["&&"] = (l, rExpr) => {
    return l && evalExpr(rExpr);
  };
  env["||"] = (l, rExpr) => {
    return l || evalExpr(rExpr);
  };
  env["?"] = (l, rExpr) => {
    return Boolean(l) && { value: evalExpr(rExpr) };
  };
  env[":"] = (l, rExpr) => {
    if (typeof l === "object") return l.value;
    if (l === false) return evalExpr(rExpr);
    if (typeof l === "string") {
      return { [l]: evalExpr(rExpr) };
    }
  };
  env["length"] = (l, rExpr) => evalExpr(rExpr).length;
  env["map"] = (l, rExpr) => l.map((v) => applyUserFunc(evalExpr(rExpr), undefined, v));
  env["forEach"] = env["map"];
}

addGlobalVals();

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  return evalExpr(expr);
}
