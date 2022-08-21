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
  const result = parseTerm(tokens, i);
  if (!result) return;
  i = result.i;
  let expr = result.expr;
  while (i < tokens.length) {
    const resultC = parseTerm(tokens, i);
    if (!resultC) break;
    i = resultC.i;
    const resultR = parseTerm(tokens, i);
    if (resultR) i = resultR.i;
    const exprL = expr;
    const exprC = resultC.expr;
    const exprR = resultR?.expr ?? { type: "Null" };
    expr = { type: "Call", func: exprC, args: { l: exprL, r: exprR } };
  }
  return { i, expr };
}

function parseTerm(tokens, i) {
  if (i >= tokens.length) return;
  const token = tokens[i];
  if (token.type === "GroupStart") {
    i++;
    const result = parseTerms(tokens, i);
    if (result) i = result.i;
    const expr = result?.expr ?? { type: "Null" };
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
  const argsLVal = evalExpr(expr.args.l);
  const func = (() => {
    const f = evalExpr(expr.func);
    if (typeof f === "string") return envVal(f);
    if (typeof f === "object") return f;
  })();
  if (typeof func === "function") {
    return func(argsLVal, expr.args.r);
  }
  if (typeof func === "object") {
    envStack.push({ args: { l: argsLVal, r: evalExpr(expr.args.r) } });
    const r = evalExpr(func);
    envStack.pop();
    return r;
  }
}

function evalExpr(expr) {
  if (expr.type === "Call") return evalCallExpr(expr);
  if (expr.type === "Number") return expr.value;
  if (expr.type === "String") return expr.value;
  if (expr.type === "Null") return undefined;
}

const envStack = [{}];

function ownerEnv(name) {
  return [...envStack].reverse().find((e) => e[name] !== undefined);
}

function envVal(name) { return ownerEnv(name)[name]; }

function addNativeFunctions() {
  envStack[0]["var"] = (arg0Val, arg1Expr) => {
    const k = evalExpr(arg1Expr);
    envStack.at(-1)[k] = null;
    return k;
  };
  envStack[0]["+"] = (arg0Val, arg1Expr) => {
    if (typeof arg0Val === "object") {
      return { ...arg0Val, ...evalExpr(arg1Expr) };
    }
    return arg0Val + evalExpr(arg1Expr);
  };
  envStack[0]["-"] = (arg0Val, arg1Expr) => {
    return arg0Val - evalExpr(arg1Expr);
  };
  envStack[0]["#"] = (arg0Val, arg1Expr) => {
    return arg0Val;
  };
  envStack[0][";"] = (arg0Val, arg1Expr) => {
    return evalExpr(arg1Expr);
  };
  envStack[0]["="] = (arg0Val, arg1Expr) => {
    if (arg0Val instanceof Array) {
      console.assert(arg0Val.length === 2);
      const [obj, k] = arg0Val;
      const v = evalExpr(arg1Expr);
      obj[k] = v;
      return v;
    }
    const k = arg0Val;
    const v = evalExpr(arg1Expr);
    const env = ownerEnv(k) ?? envStack.at(-1);
    env[k] = v;
    return v;
  };
  envStack[0]["$"] = (arg0Val, arg1Expr) => {
    const k = evalExpr(arg1Expr);
    const v = envVal(k);
    return v;
  };
  envStack[0]["."] = (arg0Val, arg1Expr) => {
    const obj = arg0Val;
    const key = evalExpr(arg1Expr);
    return obj[key];
  };
  envStack[0][","] = (arg0Val, arg1Expr) => {
    const arg1Val = evalExpr(arg1Expr);
    if (arg0Val instanceof Array) return [...arg0Val, arg1Val];
    return [arg0Val, arg1Val];
  };
  envStack[0]["=>"] = (arg0Val, arg1Expr) => {
    return arg1Expr;
  };
  envStack[0]["=="] = (arg0Val, arg1Expr) => {
    return arg0Val === evalExpr(arg1Expr);
  };
  envStack[0]["<"] = (arg0Val, arg1Expr) => {
    return arg0Val < evalExpr(arg1Expr);
  };
  envStack[0]["print"] = (arg0Val, arg1Expr) => {
    log(arg0Val ?? evalExpr(arg1Expr));
    return undefined;
  };
  envStack[0]["&&"] = (arg0Val, arg1Expr) => {
    return arg0Val && evalExpr(arg1Expr);
  };
  envStack[0]["||"] = (arg0Val, arg1Expr) => {
    return arg0Val || evalExpr(arg1Expr);
  };
  envStack[0]["?"] = (arg0Val, arg1Expr) => {
    return Boolean(arg0Val) && { value: evalExpr(arg1Expr) };
  };
  envStack[0][":"] = (arg0Val, arg1Expr) => {
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

