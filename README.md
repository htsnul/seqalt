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

辞書とクロージャーを組み合わせれば、クラスも、

```
"Position" = (("x", "y") => {
  @var "this" = {
    "x": x,
    "y": y,
    "move": (("x", "y") => {
      [this, "x"] = (this.x + x);
      [this, "y"] = (this.y + y);
    }),
    "print": (() => {
      @print((this.x) + ", " + (this.y));
    })
  }
});

"pos" = (@Position(0, 5));

@(pos.print)();
@(pos.move)(2, 2);
@(pos.print)();
@(pos.move)(3, 3);
@(pos.print)();
```

出力：

```
0, 5
2, 7
5, 10
```

と実現できる。

## 全体の流れ

1. 文字列をトークン配列に変換
2. トークン配列を構文木に変換
3. 構文木を評価

コードは、

```
export function evalCode(code) {
  const tokens = tokenize(code);
  const expr = parse(tokens);
  return evalExpr(createRootEnv(), expr);
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
    } else if (r = str.slice(i).match(/^[A-Za-z_]\w*|^[!#-'*-/:-@^`|~]+/)) {
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

文字列は `"` 間を判定しているが、エスケープ処理のため、`\` は次の文字とセットで優先して読み、
その後、`replace` で `\` 後の文字のみ取り出している。
今回は対応してないが、改行などのエスケープ文字に対応する場合はここで行うことになるだろう。

シンボルは、基本はよくある1文字目のみ英字アンダーバー、2文字目以降は英数字アンダーバーとしているが、
それに加えて、連続する記号もすべてシンボルと扱っている。

## トークン配列を構文木に変換

```
function parseSequence(tokens, i, subtype) {
  const exprs = [];
  while (i < tokens.length && tokens[i].type !== "SequenceEnd") {
    const result = parseExpr(tokens, i);
    i = result.i;
    exprs.push(result.expr);
  }
  return { i, expr: { type: "Sequence", subtype, exprs } };
}

function parseExpr(tokens, i) {
  const token = tokens[i];
  if (token.type === "SequenceStart") {
    const result = parseSequence(tokens, i + 1, token.string);
    console.assert(tokens[result.i].type === "SequenceEnd");
    return { i: result.i + 1, expr: result.expr };
  }
  if (token.type === "Number")
    return { i: i + 1, expr: { type: "Number", value: Number(token.string) } };
  if (token.type === "String")
    return { i: i + 1, expr: { type: "String", value: token.string } };
  if (token.type === "Symbol")
    return { i: i + 1, expr: { type: "Symbol", value: token.string } };
}

function parse(tokens) { return parseSequence(tokens, 0).expr; }
```

括弧の中身をシーケンスと呼ぶことにして、この中に複数のエクスプレッションが存在するとして読んでいく。

ルートに書いたコードは括弧の中身、つまりシーケンスであるとみなす。

エクスプレッション自体も括弧始まりのものはシーケンスとなる、なので相互に再帰的にツリーが形成されていく。

例えば、`@print("Test: " + (1 + 2))` の場合、

* Symbol: `@`
* Symbol: `print`
* Sequence: `(`
  * String: `Test: `
  * Symbol: `+`
  * Sequence: `(`
    * Number: 1
    * Symbol: `+`
    * Number: 2

となる。

## 構文木を評価

### 評価

分かりやすさのため、括弧の種類 `subtype` に関連した特殊な処理を除くと、

```
function evalSequenceExpr(env, expr) {
  ...
  let val = evalExpr(env, expr.exprs[0]);
  ...
  for (let i = 1; i < expr.exprs.length;) {
    const func = evalExpr(env, expr.exprs[i++]);
    const rExpr = expr.exprs[i++] ?? { type: "Null" };
    val = callFunc(env, func, val, rExpr);
  }
  ...
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

となる。

シーケンスの評価が、特に工夫した部分になる。

シーケンスを、

```
引数 関数0 引数0 関数1 引数1 関数2 引数2 ...
```

と、引数と関数が交互に並んでいるものとみなし、1個おきに関数呼び出しをしていく。

このとき、直前までの評価の結果を引数左、直後のエクスプレッションを引数右として関数に渡す。

ステートメントに見えるものの区切り `;` も、配列の区切り `,` も、ネイティブ関数として提供している。
このように、様々な処理を統一的に扱うことでシンプルにしている。

リポジトリ名 `seqalt` は、シーケンスを交互に関数呼び出ししていくこの仕様に由来し名付けた。

`print` のような引数左が不要な関数呼び出しは、`@print(3)` のようにダミーの値 `@` を直前に書くことになる。
逆に、二項演算子的な関数や、パイプ的な関数は通常関数の呼び出しよりも書きやすくなる。

処理は左から右に処理され、演算子の優先度のような処理はない。
なので、`3 + 5 * 4` は `32` になってしまう、これを防ぐために `3 + (5 * 4)` と書く必要がある。
逆に考えれば、優先度を覚えたり調べたりする必要がない。括弧は多くなってしまうが。

シンボルについて。シンボルは評価時に `envVal` により環境変数の対応する値になる。

### 環境変数

```
function ownerEnv(env, name) {
  return (!env || name in env) ? env : ownerEnv(env.__parentEnv, name);
}

function envVal(env, name) { return ownerEnv(env, name)[name]; }
```

環境変数は、ユーザ関数が実行されるたびに新しい環境を生成し、
旧環境を `__parentEnv` で再帰で辿る。これによりローカル変数が実現できる。

変数を参照したときは、新しい環境から順に探索される。

変数への値の代入は、ネイティブ関数 `=` の、

```
  rootEnv["="] = (env, l, rExpr) => {
    ...
    const name = l;
    const e = ownerEnv(env, name) ?? rootEnv;
    return e[name] = evalExpr(env, rExpr);
  };
```

部分で行われる。

その名前が所属する環境を探し、そこに引数左の値の名前で、引数右の値を代入している。
所属する環境がなければ、ルート環境に代入する。
引数左なので、`"x" = 3` とシンボルではなく文字列として指定する仕様とせざるを得ないが、
ここで `x` 評価時に対応する値にしたいわけではないので、そう考えるとありかもと思える。

ローカル変数は、ネイティブ関数 `var`、

```
  rootEnv["var"] = (env, l, rExpr) => {
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
  rootEnv["=>"] = (env, l, rExpr) => (
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
  const env = { __parentEnv: func.env, args: { l, r } };
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

保持しておいたネイティブ関数 `=>` 実行時の環境を `__parentEnv` として設定している。
繰り返しになるが、これによりクロージャーが可能になる。

## 配列と辞書

### 配列

配列の生成は、ネイティブ関数 `,` の、

```
  rootEnv[","] = (env, l, rExpr) => {
    ...
    if (Array.isArray(l)) return [...l, evalExpr(env, rExpr)];
    return [l, evalExpr(env, rExpr)];
  };
```

部分で実現している。

`1, 2` とすると、上記ネイティブ関数 `,` により、1、2の配列になる。
引数左が配列に対して、上記ネイティブ関数 `,` を呼び出すと、配列に値を追加していく。
なので、`1, 2, 3` とすると、1、2、3の配列となる。

これでおおよそ任意の配列が作れるのだが、要素数0、要素数1、最初の要素自体が配列の配列、
はこの方法では生成することができない。

そこで、シーケンスの評価 `evalSequenceExpr` で、

```
  if (expr.exprs.length === 0) return { "[": [], "{": {} }[expr.subtype];
  let val = evalExpr(env, expr.exprs[0]);
  if (expr.subtype === "[") val = [val];
```

と、`subtype` が `[` の場合には特殊処理を追加している。
シーケンスが空の場合には空配列、またそうでない場合に最初の要素を必ず配列に入れる。

配列を参照するには、ネイティブ関数 `.`、

```
  rootEnv["."] = (env, l, rExpr) => {
    return l[rExpr.type === "Symbol" ? rExpr.value : evalExpr(env, rExpr)];
  };
```

を使う。`type` が `Symbol` の場合は辞書を想定した処理なのでここでは直接は関係ない。
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

辞書の生成は、ネイティブ関数 `:` の

```
  rootEnv[":"] = (env, l, rExpr) => {
    ...
    if (typeof l === "string")
      return { __type: "DicUnderConstruction", body: { [l]: evalExpr(env, rExpr) } };
    if (l?.__type === "DicUnderConstruction")
      return { ...l, body: { ...l.body, [l.tmpKey]: evalExpr(env, rExpr) } };
  };
```

部分と、ネイティブ関数の `,` の

```
  rootEnv[","] = (env, l, rExpr) => {
    if (l?.__type === "DicUnderConstruction") return { ...l, tmpKey: evalExpr(env, rExpr) };
    ...
```

部分で実現する。

`"a": 1` のような、左引数が文字列の場合、`__type` により辞書構築中専用と分かる専用の値を生成し、
`body` に左引数をキー、右引数をバリューとした、キーバリューを1つのみ含む辞書を生成する。

ここに、新たに、`, "b"` のように記述を続けると、先ほどのネイティブ関数 `,` の、

```
    if (l?.__type === "DicUnderConstruction") return { ...l, tmpKey: evalExpr(env, rExpr) };
```

部分により、引数右に指定された文字列を、追加予定キー `tmpKey` として保持する。
そこに、`: 2` のように、ネイティブ関数 `:` が適用されると、
ネイティブ関数 `:` の

```
    if (l?.__type === "DicUnderConstruction")
      return { ...l, body: { ...l.body, [l.tmpKey]: evalExpr(env, rExpr) } };
```

部分により、辞書 `body` へのキーバリュー追加が完了する。

ネイティブ関数 `,` は配列操作にも使われるため区別のために、`__type` が必要になっている。

括弧を `}` で閉じ辞書が完成したときは、`evalSequenceExpr` の、

```
  if (expr.subtype === "{" && val?.__type === "DicUnderConstruction") val = val.body;
```

で `body` を取り出し、構築中専用の値から辞書そのものに変更する。
その後は、`__type` が無くなるため、ネイティブ関数 `,` による配列生成、配列追加の対象として扱えるようになる。

辞書を参照するには、配列でも登場したネイティブ関数 `.`、

```
  rootEnv["."] = (env, l, rExpr) => {
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

配列、辞書それぞれの代入は、ネイティブ関数 `=` の

```
  rootEnv["="] = (env, l, rExpr) => {
    if (Array.isArray(l) && l.length === 2) {
      const [obj, key] = l;
      return obj[key] = evalExpr(env, rExpr);
    }
    ...
  };
```

部分で行われる。

配列、辞書への代入では、所属する辞書、配列自体も必要となるため、
左引数では、所属するオブジェクトとキー名を配列長2の配列で受け取る。

配列、辞書それぞれ、

```
[ary, 2] = 9;
[dic, "b"] = 4;
```

と代入することができる。
入れ子になっている場合には、

```
[(ary.0), 1] = 8;
[(dic.c), "d"] = 5;
```

となる。配列の場合は必ず `(`、`)` ではなく `[`、`]` を使う必要がある。
既に説明したように、最初の要素が配列内の配列となるようにするためである。

辞書では `(`、`)` を使っても良いのだが、上記では配列との統一のため `[`、`]` を使った。

## その他ネイティブ関数

### コメント

```
  rootEnv["rem"] = (env, l, rExpr) => l;
```

右引数を評価せずに無視するだけの関数。これを使って

```
@rem "This is comment";
```

とする。ちょっと冗長ではある。

### 条件分岐

条件分岐は、以下のネイティブ関数で実現している。

```
  rootEnv["&&"] = (env, l, rExpr) => (l && evalExpr(env, rExpr));
  rootEnv["||"] = (env, l, rExpr) => (l || evalExpr(env, rExpr));
  rootEnv["?"] = (env, l, rExpr) =>
    ({ __type: "IfThenResult", isTrue: l, exprIfTrue: rExpr });
  rootEnv[":"] = (env, l, rExpr) => {
    if (l?.__type === "IfThenResult")
      return evalExpr(env, l.isTrue ? l.exprIfTrue : rExpr);
    ...
  };
```

`if` などは用意していないが、これらがあれば同等のことができる。

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
ネイティブ関数 `?` の呼び出し結果をネイティブ関数 `:` の引数左で受け取ることでそれらしく動くようにしている。

### 高階関数

ネイティブ関数 `map`、

```
  rootEnv["map"] = (env, l, rExpr) => {
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

