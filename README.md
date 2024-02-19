# 160行で作るシンプルプログラミング言語

## 概要

シンプルかつ基本機能を備えたプログラミング言語を作ってみたい。

https://htsnul.github.io/seqalt/

で触ることができる。

https://github.com/htsnul/seqalt/blob/main/seqalt.js

がメイン実装。

Hello Worldは、

```
@print("Hello World!");
```

となる。


簡単な計算は、

```
@print((5 + 6) - (1 + 2) + (3 * 4));
```

出力：

```
20
```

とできる。

フィボナッチの計算は、

```
"fib" = (("val") => {
  (val < 2) ? {
    val
  } : {
    (@fib(val - 1)) + (@fib(val - 2))
  }
});

@print(@fib(7));
@print(@fib(8));
@print(@fib(9));
@print(@fib(10));
```

出力：

```
13
21
34
55
```

とできる。

配列の高階関数処理は、

```
"nums" = (
  [1, 2, 3, 4]
  map(("v") => (v * 2))
  map(("v") => (v + 1))
);
(nums)forEach(("val") => (@print(val)));
```

出力：

```
3
5
7
9
```

となる。

クロージャも、

```
"createCounter" = (() => {
  @var "count" = 0;
  (() => {
    @var "result" = count;
    "count" = (count + 1);
    result
  })
});

"c0" = (@createCounter());
"c1" = (@createCounter());

@print(@c0());
@print(@c0());
@print(@c1());
@print(@c1());

@print(@c0());
@print(@c1());
```

出力：

```
0
1
0
1
2
2
```

となる。

## 全体の流れ

1. 文字列をトークン配列に変換
2. トークン配列を構文木に変換
3. 構文木を評価

コードは、

```
export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  const env = {};
  addGlobalVals(env);
  return evalExpr(env, expr);
}
```

が対応する。

## 文字列をトークン配列に変換

```
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
```

* 括弧開始
* 括弧終了
* 数字
* 文字列
* シンボル

の何れかの種類として文字列を切り分けていく。

## トークン配列を構文木に変換

```
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
```

括弧の中身をシーケンスと呼ぶことにして、この中に複数のエクスプレッションが存在するとして読んでいく。

ルートに書いたコードは括弧の中身、つまりシーケンスであるとみなす。

エクスプレッション自体も括弧始まりのものはシーケンスとなる、なので相互に再帰的にツリーが形成されていく。

## 構文木を評価

### 評価

```
function evalSequenceExpr(env, expr) {
  if (expr.exprs.length === 0) return expr.isArray ? [] : undefined;
  let val = evalExpr(env, expr.exprs[0]);
  if (expr.isArray) val = [val];
  for (let i = 1; i < expr.exprs.length;) {
    const func = evalExpr(env, expr.exprs[i++]);
    const rExpr = expr.exprs[i++] ?? { type: "Null" };
    val = callFunc(env, func, val, rExpr);
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
```

シンプルだがシーケンスと呼んでいる構造の評価が、工夫している部分になる。

シーケンスは、

```
引数 関数0 引数0 関数1 引数1 関数2 引数2...
```

と、引数と関数が交互に並んでいるとみなし、1個おきに関数呼び出しをしていく。

このとき、直前までの評価の結果を引数左、直後のエクスプレッションを引数右として関数に渡す。

ステートメントに見えるものの区切り `;` も、配列の区切り `,` も、ネイティブ関数として提供している。
このように、様々な処理を統一的に扱うことでシンプルにしている。

`seqalt` という名前は、シーケンスを交互に関数呼び出ししていく構造に由来している。

`print` のような引数左が不要な関数呼び出しは、`@print(3)` のようにダミーの値 `@` を直前に書くことになる。
逆に、二項演算子的な関数や、パイプ的な関数は通常関数の呼び出しよりも書きやすくなる。

処理は左から右に処理され、演算子の優先度のような処理はない。
なので、`3 + 5 * 4` は `32` になってしまう、これを防ぐために `3 + (5 * 4)` と書く必要がある。
逆に考えれば、優先度を覚えたり調べたりする必要がない。括弧は多くなってしまうが。

`isArray` 部分は、配列で後に説明する。

シンボルについて。シンボルは評価時に環境変数の探索を行い、対応する値になる。

### 環境変数

```
function ownerEnv(env, name) {
  return (!env || name in env) ? env : ownerEnv(env._parentEnv, name);
}

function envVal(env, name) { return ownerEnv(env, name)[name]; }
```

環境変数は、ユーザ関数が実行されるたびに新しい環境を生成し、
旧環境を `_parentEnv` で再帰で辿る。これによりローカル変数が実現できる。

変数を参照したときは、新しい環境から順に探索される。

変数に値を代入するのは、ネイティブ関数 `=`、

```
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
```

を使う。

`if` の部分は、配列や辞書を使った場合の処理なので、今は気にせずそれ以外の処理を見ると、
その名前が所属する環境を探し、そこに引数左の値の名前で、引数右の値を代入している。
所属する環境がなければ、ルート環境に代入する。
引数左なので、`"x" = 3` とシンボルではなく文字列として指定する仕様とせざるを得ないが、
ここで `x` 評価時に対応する値にしたいわけではないので、そう考えるとありかもと思える。

ローカル変数は、ネイティブ関数 `var`、

```
  env["var"] = (env, l, rExpr) => {
    const name = evalExpr(env, rExpr);
    env[name] = null;
    return name;
  };
```

で生成できる。

現環境に、引数右の値の名前で `null` を設定する。
`name` を返しているので、`=` と組み合わせて `@var "x" = 3` のように書ける。

### ユーザー関数

ユーザー関数は、ネイティブ関数 `=>`、

```
  env["=>"] = (env, l, rExpr) => (
    { env, argNames: (Array.isArray(l) ? l : [l]), expr: rExpr }
  );
```

で生成できる。

基本的には変数に代入して `@func(...)` のように呼び出す。
そのまま `@(() => { ... })()` と呼び出すこともできる。

引数右のエクスプレッションを、後で実行するために、実行せずそのまま保持している。

また、ネイティブ関数 `=>` 実行時の環境 `env` を保持している。
（生成したユーザー関数自体の実行時ではない点に注目）
これにより、クロージャーが可能になる。

引数左に書かれている文字列を引数名として保持する。
引数左なので、評価されてしまうので、シンボルではなく文字列を使わざるを得ない。
`("x", "y") => { ... }` みたいになってしまうが、
変数代入と同様に、変数として探索されるものではないので、
シンボルでないことは見方によっては自然かもしれない。

### 関数呼び出し

```
function callUserFunc(func, l, r) {
  const env = { _parentEnv: func.env, args: { l, r } };
  if (Array.isArray(r)) func.argNames.forEach((name, i) => env[name] = r[i]);
  else env[func.argNames[0]] = r;
  const val = evalExpr(env, func.expr);
  return val;
}

function callFunc(env, func, l, rExpr) {
  if (typeof func === "function") return func(env, l, rExpr);
  if (typeof func === "object") return callUserFunc(func, l, evalExpr(env, rExpr));
}
```

引数右はネイティブ関数にはエクスプレッションのまま渡し、評価するかどうかを選べるようにしている。

これは、条件分岐やユーザー関数定義のような場合に、右側のエクスプレッションを評価したくない場合があるためだ。
エクスプレッションのまま受け取れるのはネイティブ関数の引数右だけなので、
引数をエクスプレッションのまま処理したい場合は、ネイティブ関数の引数右を利用する必要がある。

ユーザー関数は、取っておいたエクスプレッションを実行する。
このとき、新しい環境を作り、そこに引数を追加している。
引数は `args` として参照できるが、
右引数に限って、引数名としてネイティブ関数 `=>` 実行時に保持された値があれば、
それらの値でも参照できるように変数追加している。

保持しておいたネイティブ関数 `=>` 実行時の環境を `_parentEnv` として設定している。
繰り返しになるが、これによりクロージャーが可能になる。

## 配列と辞書

### 配列

配列の生成は、ネイティブ関数 `,`、

```
  env[","] = (env, l, rExpr) => {
    const r = evalExpr(env, rExpr);
    if (l instanceof Array) return [...l, r];
    if (typeof l === "object" && typeof r === "object") return { ...l, ...r };
    return [l, r];
  };
```

で実現している。`object` が含まれている行は辞書のための処理でここでは関係ない。

`1, 2` とすると、上記ネイティブ関数 `,` により、1、2の配列になる。
引数左が配列に対して、上記ネイティブ関数 `,` を呼び出すと、配列に値を追加していく。
なので、`1, 2, 3` とすると、1、2、3の配列となる。

これでおおよそ任意の配列が作れるのだが、要素数0、要素数1、最初の要素自体が配列の配列、
はこの方法では生成することができない。

なので、`[`、`]` で表現されたシーケンスの評価には `isArray` が渡るようにし、
先述のシーケンスの評価 `evalSequenceExpr` で、

```
  if (expr.exprs.length === 0) return expr.isArray ? [] : undefined;
  let val = evalExpr(env, expr.exprs[0]);
  if (expr.isArray) val = [val];
```

と、空の場合には空配列、またそうでない場合に最初の要素を必ず配列に入れる、
という特殊処理を追加している。

配列を参照するには、ネイティブ関数 `.`、

```
  env["."] = (env, l, rExpr) => {
    return l[rExpr.type === "Symbol" ? rExpr.value : evalExpr(env, rExpr)];
  };
```

を使う。`type` が `Symbol` の場合は辞書を想定しているのでここでは直接は関係ない。
引数左を配列として、引数右のインデクスで参照する。

```
"nums" = [5, 6, 7, 8];

@print(nums.1);
@print(nums.2);
"i" = 3;
@print(nums.(i));
```

添え字に変数を使う場合は、辞書のための `Symbol` とみなされる条件を回避するため、
括弧で囲う必要があるので注意が必要になる。

### 辞書

辞書の生成は、ネイティブ関数 `:`、

```
  env[":"] = (env, l, rExpr) => {
    if (typeof l === "object") return l.value;
    if (l === false) return evalExpr(env, rExpr);
    if (typeof l === "string") return { [l]: evalExpr(env, rExpr) };
  };
```

と、先ほどのネイティブ関数 `,` で実現する。
条件分岐にも利用されるのでここでは最終行のみが関係する。
左引数をキー、右引数をバリューとした、キーバリューを1つのみ含む辞書を生成する。

これを先ほどの `,` で辞書同士を結合できるようにしているので、

```
"a" = { { "b": 2 }, { "c": { "d": 3 } } };
```
のように生成することができる。

辞書を参照するには、配列でも登場したネイティブ関数 `.`、

```
  env["."] = (env, l, rExpr) => {
    return l[rExpr.type === "Symbol" ? rExpr.value : evalExpr(env, rExpr)];
  };
```

を使う。
辞書の要素を参照するのに、文字列を指定するのは少し煩雑なので、
引数右を評価せず、シンボル値を直接拾うようにしている。これにより、

```
@print(a.b);
@print(a.c.d);
```

のようにJSのような記法で参照できる。

### 配列、辞書への代入

配列、辞書それぞれの代入では、ネイティブ関数 `=`、

```
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
```

の `if` が書かれた行で行われる。

配列、辞書への代入では、所属する辞書、配列自体も必要となるため、
左引数では、所属するオブジェクトとキー名を配列長2の配列で受け取る。

配列、辞書それぞれ、

```
[ary, 2] = 9;
(dic, "b") = 4;
```

と代入することができる。
入れ子になっている場合には、

```
(dic.c, "d") = 5;
[(ary.0), 1] = 8;
```

となる。配列の場合に `(`、`)` ではなく `[`、`]` を使っているのは、
既に説明したように、最初の要素が配列内の配列となるようにするためである。

## その他ネイティブ関数

### コメント

```
  env["rem"] = (env, l, rExpr) => l;
```

右引数を評価せずに無視するだけの関数。これを使って

```
@rem "This is comment";
```

とする。ちょっと冗長ではある。

### 条件分岐

条件分岐は、ネイティブ関数で実現している。

```
  env["&&"] = (env, l, rExpr) => (l && evalExpr(env, rExpr));
  env["||"] = (env, l, rExpr) => (l || evalExpr(env, rExpr));
  env["?"] = (env, l, rExpr) => (Boolean(l) && { value: evalExpr(env, rExpr) });
  env[":"] = (env, l, rExpr) => {
    if (typeof l === "object") return l.value;
    if (l === false) return evalExpr(env, rExpr);
    if (typeof l === "string") return { [l]: evalExpr(env, rExpr) };
  };
```

`if` などは用意していないが、これらがあれば同等のことができる。
やってはいないがダミー関数 `if` などを用意すれば見た目だけは近づけられるかもしれない。

```
(3 < 5) && {
  @print("3 < 5")
};

(3 > 5) ? {
  @print("3 > 5")
} : {
  @print("Not 3 > 5")
};

"x" = 3;

((x == 2) || (x == 3)) && {
  @print("x is 2 or 3.")
}
```

通常の関数とは異なり、それぞれ条件を満たさなかった場合は、
実行が行われないようにエクスプレッションの評価を行わないようにする必要がある。

三項演算子に見えるものは実際に三項演算子なわけではなく、
ネイティブ関数 `?` の呼び出し結果を `:` の引数左で受け取ることでそれらしく動くようにしている。

最後の `"string"` 型の場合は、辞書の実装で使われているものなのでここでの条件分岐には関係ない。

### 高階関数

ネイティブ関数 `map`、

```
  env["map"] = (env, l, rExpr) => {
    const func = evalExpr(env, rExpr);
    return l.map((v) => callUserFunc(func, undefined, v));
  };
```

で、引数右をユーザー関数として、 配列要素を引数として呼び出ししていく。

```
"nums" = (
  [1, 2, 3, 4]
  map(("v") => (v * 2))
  map(("v") => (v + 1))
);
(nums)forEach(("val") => (@print(val)));
```

とできる。

## まとめ

シンプルかつ基本機能を備えたプログラミング言語を作った気になれた。

