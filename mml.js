function tokenize(str) {
  const isParen = (c) => {
    const cp = c.codePointAt(0);
    return "(".codePointAt(0) === cp || cp === ")".codePointAt(0);
  };
  const isDigit = (c) => {
    const cp = c.codePointAt(0);
    return "0".codePointAt(0) <= cp && cp <= "9".codePointAt(0);
  };
  const isAlpha = (c) => {
    const cp = c.codePointAt(0);
    return (
      "A".codePointAt(0) <= cp && cp <= "Z".codePointAt(0) ||
      "a".codePointAt(0) <= cp && cp <= "z".codePointAt(0)
    );
  };
  const isSign = (c) => {
    const cp = c.codePointAt(0);
    return (
      "!".codePointAt(0) <= cp && cp <= "/".codePointAt(0) ||
      ":".codePointAt(0) <= cp && cp <= "@".codePointAt(0) ||
      "[".codePointAt(0) <= cp && cp <= "`".codePointAt(0) ||
      "{".codePointAt(0) <= cp && cp <= "~".codePointAt(0)
    );
  };
  let tokens = [];
  for (let i = 0; i < str.length;) {
    if (isParen(str[i])) {
      tokens.push({ type: "Paren", value: str[i] });
      i++;
    } else if (isDigit(str[i])) {
      let e = i + 1;
      while (e < str.length && isDigit(str[e])) ++e;
      tokens.push({ type: "Number", value: Number(str.slice(i, e)) });
      i = e;
    } else if (isSign(str[i]) && !isParen(str[i])) {
      let e = i + 1;
      while (e < str.length && isSign(str[e]) && !isParen(str[e])) ++e;
      tokens.push({ type: "Identifier", value: str.slice(i, e) });
      i = e;
    } else if (isAlpha(str[i])) {
      let e = i + 1;
      while (e < str.length && isAlpha(str[e])) ++e;
      tokens.push({ type: "Identifier", value: str.slice(i, e) });
      i = e;
    } else {
      ++i;
    }
  }
  return tokens;
}

function parseExpr(tokens, i) {
  const r0 = parsePrimary(tokens, i);
  if (r0 === undefined) {
    return undefined;
  }
  i = r0[0];
  let expr = r0[1];
  while (i < tokens.length) {
    const r1 = parsePrimary(tokens, i);
    if (r1 === undefined) {
      break;
    }
    i = r1[0];
    const r2 = parsePrimary(tokens, i);
    i = r2[0];
    expr = { type: "Call", name: r1[1], args: [ expr, r2[1]] };
  }
  return [i, expr];
}

function parsePrimary(tokens, i) {
  const token = tokens[i];
  if (token.type === "Paren" && token.value === "(") {
    i++;
    let expr;
    const r = parseExpr(tokens, i);
    if (r === undefined) {
      expr = { type: "Null" };
    } else {
      i = r[0];
      expr = r[1];
    }
    console.assert(tokens[i].type === "Paren" && tokens[i].value === ")");
    i++;
    return [i, expr];
  }
  if (token.type === "Number") {
    i++;
    return [i, { type: "Number", value: token.value }];
  }
  if (token.type === "Identifier") {
    i++;
    return [i, { type: "Identifier", value: token.value }];
  }
  return undefined;
}

function evalExpr(expr) {
  if (expr.type === "Call") {
    const name = evalExpr(expr.name);
    if (name === "#") {
      return evalExpr(expr.args[0]);
    }
    if (name === ";") {
      evalExpr(expr.args[0]);
      return evalExpr(expr.args[1]);
    }
    if (name === "=") {
      const v = evalExpr(expr.args[1]);
      environment[evalExpr(expr.args[0])] = v;
      //console.log("expr.args[0]", expr.args[0]);
      //environment[expr.args[0].value] = v;
      return v;
    }
    if (name === "+") {
      return evalExpr(expr.args[0]) + evalExpr(expr.args[1]);
    }
    if (name === "-") {
      return evalExpr(expr.args[0]) - evalExpr(expr.args[1]);
    }
    if (name === "==") {
      return evalExpr(expr.args[0]) === evalExpr(expr.args[1]);
    }
    if (name === "print") {
      console.log(evalExpr(expr.args[0]), evalExpr(expr.args[1]));
      return undefined;
    }
    if (name === "and") {
      if (e = evalExpr(expr.args[0])) {
        return evalExpr(expr.args[1]);
      }
      return undefined;
    }
    if (name === "then") {
      if (evalExpr(expr.args[0])) {
        return evalExpr(expr.args[1]);
      }
      return undefined;
    }
  }
  if (expr.type === "Number") {
    return expr.value;
  }
  if (expr.type === "Identifier") {
    if (environment[expr.value] !== undefined) {
      return environment[expr.value];
    }
    return expr.value;
  }
  if (expr.type === "Null") {
    return undefined;
  }
}

const environment = [];
//const code = "(3+10)-(8+4+2)print()print(3)";
const code = `
()print((3 + 10) - (8 + 4 + 2));
()print(3);
()print(3 == 3);
0 and(()print(10));
1 and(()print(11));
1 then (
  ()print(12)
);
a=5;
()print(a);
a=(a+3);
()print(a)
`;
//3==4and print(hoge)
//(3==4)if(()prnt(a),()print(b))
//const code = "3+5print3;()print4";
//const code = "(3+10)-(8+4+2)"
//const code = "3+10-8+4+2";
console.log(code);
tokens = tokenize(code);
console.log(tokens);
console.log(JSON.stringify(parseExpr(tokens, 0)[1], null, 2));
console.log(evalExpr(parseExpr(tokens, 0)[1]));
console.log(environment);
