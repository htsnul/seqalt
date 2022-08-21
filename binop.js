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
  envStack[0]["var"] = (argLVal, argRExpr) => {
    const k = evalExpr(argRExpr);
    envStack.at(-1)[k] = null;
    return k;
  };
  envStack[0]["+"] = (argLVal, argRExpr) => {
    if (typeof argLVal === "object") {
      return { ...argLVal, ...evalExpr(argRExpr) };
    }
    return argLVal + evalExpr(argRExpr);
  };
  envStack[0]["-"] = (argLVal, argRExpr) => {
    return argLVal - evalExpr(argRExpr);
  };
  envStack[0]["#"] = (argLVal, argRExpr) => {
    return argLVal;
  };
  envStack[0][";"] = (argLVal, argRExpr) => {
    return evalExpr(argRExpr);
  };
  envStack[0]["="] = (argLVal, argRExpr) => {
    if (argLVal instanceof Array) {
      console.assert(argLVal.length === 2);
      const [obj, k] = argLVal;
      const v = evalExpr(argRExpr);
      obj[k] = v;
      return v;
    }
    const k = argLVal;
    const v = evalExpr(argRExpr);
    const env = ownerEnv(k) ?? envStack.at(-1);
    env[k] = v;
    return v;
  };
  envStack[0]["$"] = (argLVal, argRExpr) => {
    const k = evalExpr(argRExpr);
    const v = envVal(k);
    return v;
  };
  envStack[0]["."] = (argLVal, argRExpr) => {
    const obj = argLVal;
    const key = evalExpr(argRExpr);
    return obj[key];
  };
  envStack[0][","] = (argLVal, argRExpr) => {
    const argRVal = evalExpr(argRExpr);
    if (argLVal instanceof Array) return [...argLVal, argRVal];
    return [argLVal, argRVal];
  };
  envStack[0]["=>"] = (argLVal, argRExpr) => {
    return argRExpr;
  };
  envStack[0]["=="] = (argLVal, argRExpr) => {
    return argLVal === evalExpr(argRExpr);
  };
  envStack[0]["<"] = (argLVal, argRExpr) => {
    return argLVal < evalExpr(argRExpr);
  };
  envStack[0]["print"] = (argLVal, argRExpr) => {
    log(argLVal ?? evalExpr(argRExpr));
    return undefined;
  };
  envStack[0]["&&"] = (argLVal, argRExpr) => {
    return argLVal && evalExpr(argRExpr);
  };
  envStack[0]["||"] = (argLVal, argRExpr) => {
    return argLVal || evalExpr(argRExpr);
  };
  envStack[0]["?"] = (argLVal, argRExpr) => {
    return Boolean(argLVal) && { value: evalExpr(argRExpr) };
  };
  envStack[0][":"] = (argLVal, argRExpr) => {
    if (typeof argLVal === "object") return argLVal.value;
    if (argLVal === false) return evalExpr(argRExpr);
    if (typeof argLVal === "string") {
      return { [argLVal]: evalExpr(argRExpr) };
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

