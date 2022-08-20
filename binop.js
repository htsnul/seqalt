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

function evalExpr(expr) {
  if (expr.type === "Call") {
    const args0Val = evalExpr(expr.args[0]);
    const func = (() => {
      const f = evalExpr(expr.func);
      if (typeof f === "string") {
        return getEnvironmentValue(f);
      } else {
        console.assert(typeof f === "object");
        return f;
      }
    })();
    if (typeof func === "function") {
      return func(args0Val, expr.args[1]);
    } else {
      console.assert(typeof func === "object");
      environment = { parent: environment };
      environment["args"] = [args0Val, evalExpr(expr.args[1])];
      const r = evalExpr(func);
      environment = environment.parent;
      return r;
    }
  }
  if (expr.type === "Number") {
    return expr.value;
  }
  if (expr.type === "String") {
    return expr.value;
  }
  if (expr.type === "Null") {
    return undefined;
  }
}

let environment = {};

function getEnvironmentValue(name) {
  let e = environment;
  while (e !== undefined) {
    const v = e[name];
    if (v !== undefined) {
      return v;
    }
    e = e.parent;
  }
}

function addNativeFunctions() {
  environment["+"] = (arg0Val, arg1Expr) => {
    return arg0Val + evalExpr(arg1Expr);
  };
  environment["-"] = (arg0Val, arg1Expr) => {
    return arg0Val - evalExpr(arg1Expr);
  };
  environment["#"] = (arg0Val, arg1Expr) => {
    return arg0Val;
  };
  environment[";"] = (arg0Val, arg1Expr) => {
    return evalExpr(arg1Expr);
  };
  environment["="] = (arg0Val, arg1Expr) => {
    const k = arg0Val;
    const v = evalExpr(arg1Expr);
    environment[k] = v;
    return v;
  };
  environment["$"] = (arg0Val, arg1Expr) => {
    const k = evalExpr(arg1Expr);
    const v = getEnvironmentValue(k);
    return v;
  };
  environment["."] = (arg0Val, arg1Expr) => {
    const obj = arg0Val;
    const key = evalExpr(arg1Expr);
    return obj[key];
  };
  environment[","] = (arg0Val, arg1Expr) => {
    const arg1Val = evalExpr(arg1Expr);
    if (arg0Val instanceof Array) {
      return [...arg0Val, arg1Val];
    }
    return [arg0Val, arg1Val];
  };
  environment["=>"] = (arg0Val, arg1Expr) => {
    return arg1Expr;
  };
  environment["=="] = (arg0Val, arg1Expr) => {
    return arg0Val === evalExpr(arg1Expr);
  };
  environment["<"] = (arg0Val, arg1Expr) => {
    return arg0Val < evalExpr(arg1Expr);
  };
  environment["print"] = (arg0Val, arg1Expr) => {
    log(arg0Val ?? evalExpr(arg1Expr));
    return undefined;
  };
  environment["&&"] = (arg0Val, arg1Expr) => {
    return arg0Val && evalExpr(arg1Expr);
  };
  environment["||"] = (arg0Val, arg1Expr) => {
    return arg0Val || evalExpr(arg1Expr);
  };
  environment["?"] = (arg0Val, arg1Expr) => {
    return arg0Val && { value: evalExpr(arg1Expr) };
  };
  environment[":"] = (arg0Val, arg1Expr) => {
    return arg0Val ? arg0Val.value : evalExpr(arg1Expr);
  };
}

addNativeFunctions();

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  return evalExpr(expr);
}

