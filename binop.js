function tokenize(str) {
  const tokens = [];
  for (let i = 0; i < str.length; ) {
    let r;
    if (str[i] === "(") {
      tokens.push({ type: "GroupStart" });
      i++;
    } else if (str[i] === ")") {
      tokens.push({ type: "GroupEnd" });
      i++;
    } else if ((r = str.slice(i).match(/^\d+/))) {
      tokens.push({ type: "Number", value: Number(r[0]) });
      i += r[0].length;
    } else if ((r = str.slice(i).match(/^\w+|^[^\w\d\s()]+/))) {
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
    const result = evalExpr(func);
    envStack.pop();
    return result;
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

function envVal(name) {
  return ownerEnv(name)[name];
}

function addNativeFuncs() {
  envStack[0]["+"] = (l, rExpr) => {
    if (typeof l === "object") return { ...l, ...evalExpr(rExpr) };
    return l + evalExpr(rExpr);
  };
  envStack[0]["-"] = (l, rExpr) => {
    return l - evalExpr(rExpr);
  };
  envStack[0]["*"] = (l, rExpr) => {
    return l * evalExpr(rExpr);
  };
  envStack[0]["#"] = (l, rExpr) => l;
  envStack[0][";"] = (l, rExpr) => evalExpr(rExpr);
  envStack[0]["var"] = (l, rExpr) => {
    const name = evalExpr(rExpr);
    envStack.at(-1)[name] = null;
    return name;
  };
  envStack[0]["="] = (l, rExpr) => {
    if (l instanceof Array) {
      console.assert(l.length === 2);
      const [obj, key] = l;
      return obj[key] = evalExpr(rExpr);
    }
    const name = l;
    const env = ownerEnv(name) ?? envStack.at(-1);
    return env[name] = evalExpr(rExpr);
  };
  envStack[0]["$"] = (l, rExpr) => envVal(evalExpr(rExpr));
  envStack[0]["."] = (l, rExpr) => l[evalExpr(rExpr)];
  envStack[0][","] = (l, rExpr) => {
    const r = evalExpr(rExpr);
    if (l instanceof Array) return [...l, r];
    return [l, r];
  };
  envStack[0]["=>"] = (l, rExpr) => rExpr;
  envStack[0]["=="] = (l, rExpr) => {
    return l === evalExpr(rExpr);
  };
  envStack[0]["<"] = (l, rExpr) => {
    return l < evalExpr(rExpr);
  };
  envStack[0]["print"] = (l, rExpr) => {
    log(l ?? evalExpr(rExpr));
    return undefined;
  };
  envStack[0]["&&"] = (l, rExpr) => {
    return l && evalExpr(rExpr);
  };
  envStack[0]["||"] = (l, rExpr) => {
    return l || evalExpr(rExpr);
  };
  envStack[0]["?"] = (l, rExpr) => {
    return Boolean(l) && { value: evalExpr(rExpr) };
  };
  envStack[0][":"] = (l, rExpr) => {
    if (typeof l === "object") return l.value;
    if (l === false) return evalExpr(rExpr);
    if (typeof l === "string") {
      return { [l]: evalExpr(rExpr) };
    }
  };
  envStack[0]["map"] = (l, rExpr) => {
    const r = evalExpr(rExpr);
    return l.map((v) => {
      envStack.push({ args: { r: v } });
      const result = evalExpr(r);
      envStack.pop();
      return result;
    });
  };
  envStack[0]["forEach"] = envStack[0]["map"];
}

addNativeFuncs();

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  return evalExpr(expr);
}
