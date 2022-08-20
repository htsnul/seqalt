function tokenize(str) {
  const tokens = [];
  for (let i = 0; i < str.length;) {
    let r;
    if (str[i] === "(") {
      tokens.push({ type: "GroupStart" });
      i++;
    } else if (str[i] === ")") {
      tokens.push({ type: "GroupEnd" });
      i++;
    } else if (r = str.slice(i).match(/^\d+/)) {
      tokens.push({ type: "Number", value: Number(r[0]) });
      i += r[0].length;
    } else if (r = str.slice(i).match(/^\w+|^[^\w\d\s()]+/)) {
      tokens.push({ type: "String", value: r[0] });
      i += r[0].length;
    } else ++i;
  }
  return tokens;
}

function parseTerms(tokens, i) {
  const r0 = parseTerm(tokens, i);
  if (!r0) return;
  i = r0.i;
  let expr0 = r0.expr;
  while (i < tokens.length) {
    const r = parseTerm(tokens, i);
    if (!r) break;
    i = r.i;
    const r1 = parseTerm(tokens, i);
    if (r1) i = r1.i;
    const expr1 = r1?.expr ?? { type: "Null" };
    expr0 = { type: "Call", func: r.expr, args: [expr0, expr1] };
  }
  return { i, expr: expr0 };
}

function parseTerm(tokens, i) {
  if (i >= tokens.length) return;
  const token = tokens[i];
  if (token.type === "GroupStart") {
    i++;
    const r = parseTerms(tokens, i);
    if (r) i = r.i;
    const expr = r?.expr ?? { type: "Null" };
    console.assert(tokens[i].type === "GroupEnd");
    i++;
    return { i, expr };
  }
  if (token.type === "Number") {
    i++;
    return { i, expr: { type: "Number", value: token.value } };
  }
  if (token.type === "String") {
    i++;
    return { i, expr: { type: "String", value: token.value } };
  }
}

function parse(tokens) {
  return parseTerms(tokens, 0)?.expr ?? { type: "Null" };
}

function evalCallExpr(expr) {
  const args0Val = evalExpr(expr.args[0]);
  const func = (() => {
    const f = evalExpr(expr.func);
    if (typeof f === "string") return envVal(f);
    if (typeof f === "object") return f;
  })();
  if (typeof func === "function") {
    return func(args0Val, expr.args[1]);
  }
  if (typeof func === "object") {
    currentEnv = { parent: currentEnv, vars: {} };
    currentEnv.vars["args"] = [args0Val, evalExpr(expr.args[1])];
    const r = evalExpr(func);
    currentEnv = currentEnv.parent;
    return r;
  }
}

function evalExpr(expr) {
  if (expr.type === "Call") return evalCallExpr(expr);
  if (expr.type === "Number") return expr.value;
  if (expr.type === "String") return expr.value;
  if (expr.type === "Null") return undefined;
}

const globalEnv = { vars: {} };
let currentEnv = globalEnv;

function ownerEnvVars(name) {
  for (let e = currentEnv; e; e = e.parent) {
    if (e.vars[name] !== undefined) return e.vars;
  }
}

function envVal(name) { return ownerEnvVars(name)[name]; }

function addNativeFunctions() {
  globalEnv.vars["var"] = (arg0Val, arg1Expr) => {
    const k = evalExpr(arg1Expr);
    currentEnv.vars[k] = null;
    return k;
  };
  globalEnv.vars["+"] = (arg0Val, arg1Expr) => {
    if (typeof arg0Val === "object") {
      return { ...arg0Val, ...evalExpr(arg1Expr) };
    }
    return arg0Val + evalExpr(arg1Expr);
  };
  globalEnv.vars["-"] = (arg0Val, arg1Expr) => {
    return arg0Val - evalExpr(arg1Expr);
  };
  globalEnv.vars["#"] = (arg0Val, arg1Expr) => {
    return arg0Val;
  };
  globalEnv.vars[";"] = (arg0Val, arg1Expr) => {
    return evalExpr(arg1Expr);
  };
  globalEnv.vars["="] = (arg0Val, arg1Expr) => {
    if (arg0Val instanceof Array) {
      const [vars, k] = arg0Val;
      const v = evalExpr(arg1Expr);
      vars[k] = v;
      return v;
    }
    const k = arg0Val;
    const v = evalExpr(arg1Expr);
    const vars = ownerEnvVars(k) ?? currentEnv.vars;
    vars[k] = v;
    return v;
  };
  globalEnv.vars["$"] = (arg0Val, arg1Expr) => {
    const k = evalExpr(arg1Expr);
    const v = envVal(k);
    return v;
  };
  globalEnv.vars["."] = (arg0Val, arg1Expr) => {
    const obj = arg0Val;
    const key = evalExpr(arg1Expr);
    return obj[key];
  };
  globalEnv.vars[","] = (arg0Val, arg1Expr) => {
    const arg1Val = evalExpr(arg1Expr);
    if (arg0Val instanceof Array) return [...arg0Val, arg1Val];
    return [arg0Val, arg1Val];
  };
  globalEnv.vars["=>"] = (arg0Val, arg1Expr) => {
    return arg1Expr;
  };
  globalEnv.vars["=="] = (arg0Val, arg1Expr) => {
    return arg0Val === evalExpr(arg1Expr);
  };
  globalEnv.vars["<"] = (arg0Val, arg1Expr) => {
    return arg0Val < evalExpr(arg1Expr);
  };
  globalEnv.vars["print"] = (arg0Val, arg1Expr) => {
    log(arg0Val ?? evalExpr(arg1Expr));
    return undefined;
  };
  globalEnv.vars["&&"] = (arg0Val, arg1Expr) => {
    return arg0Val && evalExpr(arg1Expr);
  };
  globalEnv.vars["||"] = (arg0Val, arg1Expr) => {
    return arg0Val || evalExpr(arg1Expr);
  };
  globalEnv.vars["?"] = (arg0Val, arg1Expr) => {
    return Boolean(arg0Val) && { value: evalExpr(arg1Expr) };
  };
  globalEnv.vars[":"] = (arg0Val, arg1Expr) => {
    if (typeof arg0Val === "object") return arg0Val.value;
    if (arg0Val === false) return evalExpr(arg1Expr);
    if (typeof arg0Val === "string") {
      return { [arg0Val]: evalExpr(arg1Expr) };
    }
  };
}

addNativeFunctions();

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  return evalExpr(expr);
}

