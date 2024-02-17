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
    } else if (r = str.slice(i).match(/^\d+/)) {
      tokens.push({ type: "Number", value: Number(r[0]) });
      i += r[0].length;
    } else if (r = str.slice(i).match(/^"((\\.|[^"])*)"/)) {
      tokens.push({ type: "String", value: r[1].replace(/\\./g, (s) => s[1]) });
      i += r[0].length;
    } else if (r = str.slice(i).match(/^\w+|^[^\w\d\s()"]+/)) {
      tokens.push({ type: "Symbol", value: r[0] });
      i += r[0].length;
    } else ++i;
  }
  return tokens;
}

function parseSequence(tokens, i) {
  const exprs = [];
  while (i < tokens.length) {
    const result = parseExpr(tokens, i);
    if (!result) break;
    i = result.i;
    exprs.push(result.expr);
  }
  return { i, expr: { type: "Sequence", exprs } };
}

function parseExpr(tokens, i) {
  if (i >= tokens.length) return;
  const token = tokens[i];
  if (token.type === "GroupStart") {
    i++;
    const result = parseSequence(tokens, i);
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
  if (token.type === "Symbol") {
    i++;
    return { i, expr: { type: "Symbol", value: token.value } };
  }
}

function parse(tokens) {
  return parseSequence(tokens, 0)?.expr ?? { type: "Null" };
}

function applyFunc(func, l, rExpr) {
  if (typeof func === "function") {
    return func(l, rExpr);
  }
  if (typeof func === "object") {
    envStack.push({ args: { l, r: evalExpr(rExpr) } });
    const val = evalExpr(func);
    envStack.pop();
    return val;
  }
}

function evalSequenceExpr(expr) {
  if (expr.exprs.length === 0) return undefined;
  let val = evalExpr(expr.exprs[0]);
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

const envStack = [{}];

function ownerEnv(name) {
  return [...envStack].reverse().find((e) => e[name] !== undefined);
}

function envVal(name) {
  return ownerEnv(name)[name];
}

function addGlobalVals() {
  envStack[0]["@"] = null;
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
  envStack[0]["."] = (l, rExpr) => l[rExpr.type === "Symbol" ? rExpr.value : evalExpr(rExpr)];
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

addGlobalVals();

globalThis.log = console.log;

export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  return evalExpr(expr);
}
