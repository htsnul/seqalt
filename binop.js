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
  if (r0 === undefined) {
    return undefined;
  }
  i = r0[0];
  let expr = r0[1];
  while (i < tokens.length) {
    const r1 = parseTerm(tokens, i);
    if (r1 === undefined) {
      break;
    }
    i = r1[0];
    const r2 = parseTerm(tokens, i);
    let exprR = { type: "Null" };
    if (r2 !== undefined) {
      i = r2[0];
      exprR = r2[1];
    }
    expr = { type: "Call", name: r1[1], args: [expr, exprR] };
  }
  return [i, expr];
}

function parseTerm(tokens, i) {
  if (i >= tokens.length) {
    return undefined;
  }
  const token = tokens[i];
  if (token.type === "GroupStart") {
    i++;
    let expr;
    const r = parseTerms(tokens, i);
    if (r === undefined) {
      expr = { type: "Null" };
    } else {
      i = r[0];
      expr = r[1];
    }
    console.assert(tokens[i].type === "GroupEnd");
    i++;
    return [i, expr];
  }
  if (token.type === "Number") {
    i++;
    return [i, { type: "Number", value: token.value }];
  }
  if (token.type === "String") {
    i++;
    return [i, { type: "String", value: token.value }];
  }
  return undefined;
}

function parse(tokens) {
  return parseTerms(tokens, 0)[1];
}

function evalExpr(expr) {
  if (expr.type === "Call") {
    const args0Val = evalExpr(expr.args[0]);
    const name = evalExpr(expr.name);
    const f = getEnvironmentValue(name);
    if (typeof f === "function") {
      return f(args0Val, expr.args[1]);
    } else {
      const args = [
        args0Val,
        evalExpr(expr.args[1])
      ];
      let f = name;
      environment = { parent: environment };
      if (typeof name === "string") {
        f = getEnvironmentValue(name);
      }
      environment["args"] = args;
      const r = evalExpr(f);
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
}

addNativeFunctions();

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  console.log(expr);
  return evalExpr(expr);
}

