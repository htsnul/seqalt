# C++で「160行で作るシンプルプログラミング言語」を実装

## 概要

https://qiita.com/htsnul/items/8a53180ae711bf35ec8d

で160行で簡単なプログラミング言語を作った。
しかし、動作の多くはJSの機能を利用して実装している。
C言語の延長にあるC++ではどうやって実装すればよいのか考えてみたい。

## 追加で必要な実装

突き詰めて考えてみると、JS風の動的な値さえ用意できれば実現可能に思えてくる。

ただし、加えてメモリ管理をどうするかという問題も考える必要がある。
`shared_ptr` を使えば何とかなるかとも思えるのだが、そうはいかない。
クロージャーなどの存在により、循環参照が発生してしまう構造があるからだ。
参照カウント方式の `shared_ptr` では循環参照したメモリを解放することはできない。
つまり、ガベージコレクションも実装しなければならない。

## 動的な値

### 基本構造

基本的にはJS風の動的な値を表す型を作ればよい。

公開ヘッダの、

```
struct Value {
  using Null = std::nullptr_t;
  using NativeFunc = Value (*)(Value env, Value l, Value rExpr);
  using DynamicValuePtr = std::shared_ptr<DynamicValue>;
  using Body = std::variant<Null, double, NativeFunc, DynamicValuePtr>;
  Body body;
  ...
  Value() {}
  ...
};
```

と、cppの、

```
using Array = std::vector<Value>;
using Dic = std::unordered_map<std::string, Value>;

struct DynamicValue {
  using Body = std::variant<std::string, Array, Dic>;
  Body body;
  ...
};
```

で構成される。

この1つの型で、

* `Null` (`std::nullptr_t`)
* `double`
* `NativeFunc` (`Value (*)(Value env, Value l, Value rExpr)`)
* `DynamicValuePtr` (`std::shared_ptr<DynamicValue>`)
  * `std::string`
  * `Array` (`std::vector<Value>`)
  * `Dic` (`std::unordered_map<std::string, Value>`)

を表せるようにしている。

直接値として扱える部分と、動的なメモリ管理が必要な部分とを、
`DynamicValuePtr` により分離している。

これは、

* `Value` の基本サイズを小さくする
* 動的メモリ確保する部分を統一的に扱えるようにする

ためにそのようにしている。
前者について、`Value` のサイズは現状は3レジスタサイズになる。
`shared_ptr` が2レジスタサイズになってしまっているのが勿体ないところだ。
これは、多重継承により利用アドレスと解放アドレスが異なる場合を想定してそうなっているようだ。
後者は後述するガベージコレクション時に重要になる。

複数の型の何れかになる値は、C++ライブラリ機能 `variant` を使うと簡単に実現できる。
`variant` は、どの型かの情報を管理してくれる `union` のようなもので、
同一メモリを共有しつつ、複数の型を安全に扱うことができる。
`holds_alternatives` すればその型の値を持つか分かるし、
`get`、`get_if` すればその型の値として値を取得できる。

### 参照カウント

`DynamicValue` 部分は `shared_ptr` で管理しているので、参照カウントで管理される。
どこからも参照されなくなると自動的に解放される。
多くの場合は動的に確保されたメモリはこれで解放される。
しかし、A→B→Aのような循環する参照が発生してしまうと、
AとBがこれら以外のどこからも参照されなくなった場合でも解放されなくなってしまう。
これは、AとBが相互に参照していることで参照カウントが残ってしまうからである。

循環参照は、例えばクロージャーなどを使うと発生してしまう。

そのようなケースは、後述するガベージコレクションで対応する。
それなら参照カウントは必要ないのではないかと思われるが、参照カウントは、

* 処理負荷が軽い
* 不要になったメモリを即時解放できる
* 仕組みの一部はガベージコレクションにも活用できる

ため、参照カウントも合わせて使うことにした。

### 構築

```
struct Value {
  ...
  using ArrayInitializerList = std::initializer_list<Value>;
  using DicInitializerList = std::initializer_list<std::pair<const std::string, Value>>;
  static Value makeArray(ArrayInitializerList l = {}) { return l; }
  static Value makeDic(DicInitializerList l = {}) { return l; }
  Value() {}
  Value(double v) { body = v; }
  Value(int v) : Value(double(v)) {}
  Value(size_t v) : Value(double(v)) {}
  Value(bool v) : Value(double(v)) {}
  Value(NativeFunc f) { body = f; }
  Value(std::shared_ptr<DynamicValue> v) { body = v; }
  Value(const std::string& str);
  Value(std::string_view str) : Value(std::string(str)) {}
  Value(const char* str) : Value(std::string(str)) {}
  Value(ArrayInitializerList l);
  Value(DicInitializerList l);
};
```

と、利用する値をすべて構築できるようコンストラクタを作ってしまう。
ただし、配列と辞書だけは、`makeArray`、`makeDic` で生成できるようにしている。
これらは、コンストラクタで生成する場合には引数が曖昧となってしまうため、
明示的に `ArrayInitializerList` や `DicInitializerList` を指定する必要がある。
しかし、これだと記述が長くなってしまう。なので、専用の生成関数を用意している。

辞書は、

```
  auto env = Value::makeDic({
    {"__parentEnv", func["env"]},
    {"args", Value::makeDic({{"l", l}, {"r", r}})}
  });
```

のように、入れ子で生成することもできるようになる。

### 取得

```
struct Value {
  ...
  bool isNull() { return std::holds_alternative<Null>(body); }
  double* asNumber() { return std::get_if<double>(&body); }
  NativeFunc* asNativeFunc() { return std::get_if<NativeFunc>(&body); }
  std::shared_ptr<DynamicValue>* asDynamicValue() {
    return std::get_if<DynamicValuePtr>(&body);
  }
  std::string* asString();
  explicit operator double();
  explicit operator int() { return double(*this); }
  explicit operator size_t() { return double(*this); }
  explicit operator bool();
  explicit operator std::string();
  Value& operator[](Value v);
  size_t length();
  size_t push(Value v);
  Value* find(std::string_view s);
```

`isXxxx` や `asXxxx` でその値かどうかを判別できる。 
`asXxxx` はポインタを返すようにしている。
これは、C++の定型パターン、

```
if (auto s = l.asString()) {
  doSomething(*s)
}
```

のような書き方が書きやすいからそうしている。

`explicit operator Xxx()` は変換演算子だ。
例えば、中身が何であっても文字列を取得したい場合、
`std::string(value)` とすれば `explicit operator std::string()` が呼ばれ、
文字列を取得することができる。

## ガベージコレクション

ガベージコレクションの中でも最も簡単なマーク＆スイープを実装する。

```
struct Value {
  ...
  void mark();
  static void sweep();
  ...
};
```

```
void Value::mark() { if (auto v = asDynamicValue()) (*v)->mark(); }
void Value::sweep() { garbageCollector.sweep(); }
```

```
struct DynamicValue {
  ...
  bool isMarked{};
  ...
  void mark();
  void sweep();
};
```

```
void DynamicValue::mark() {
  if (isMarked) return;
  isMarked = true;
  if (auto array = asArray()) {
    for (auto& e : (*array)) e.mark();
  }
  if (auto dic = asDic()) {
    for (auto& [k, v] : (*dic)) v.mark();
  }
}

void DynamicValue::sweep() {
  if (!isMarked) body = Array{};
  isMarked = false;
}
```

```
struct GarbageCollector {
  std::forward_list<std::weak_ptr<DynamicValue>> values;
  template<class ...Args>
  std::shared_ptr<DynamicValue> makeShared(Args... args) {
    auto ptr = std::make_shared<DynamicValue>(args...);
    values.push_front(ptr);
    return ptr;
  }
  void sweep();
} garbageCollector;
```

```
void GarbageCollector::sweep() {
  for (auto itr = values.before_begin(); std::next(itr) != values.end();) {
    if (auto sp = std::next(itr)->lock()) sp->sweep();
    if (std::next(itr)->expired()) values.erase_after(itr); else itr++;
  }
  for (auto itr = values.before_begin(); std::next(itr) != values.end();) {
    if (std::next(itr)->expired()) values.erase_after(itr); else itr++;
  }
}
```

が関連コードになる。

`shared_ptr<DynamicValue>` を生成するときに、必ず `garbageCollector.makeShared()` を経由するようにし、
対応する `weak_ptr<DynamicValue>` を単方向リストで収集しておく。

参照カウントのみで無事に解放された場合には、`expired()` となるので、リストからそのまま外せばよい。
循環参照により参照カウントのみでは解放できない状況のため、`mark()`、`sweep()` を行う。

具体的には、ルート環境 `rootEnv` など、残したいものに対して `Value::mark()` を呼ぶ。
これは、再帰的に参照している全ての `DynamicValue` を `isMarked` にする。

その後、`garbageCollector.sweep()` を呼ぶことで、
全 `weak_ptr<DynamicValue>` に対して、`isMarked` でないものに対して空配列を代入していく。
この空配列を代入した時点で、その `DynamicValue` が参照していた他 `DynamicValue` の参照カウントが下がるため、
参照カウントの仕組みで他 `DynamicValue` が解放される。
仮にその `DynamicValue` がまさに空配列を代入した `DynamicValue` を参照し循環参照となっていた場合には、
`weak_ptr<DynamicValue>::lock()` を終えた時点で元 `DynamicValue` も参照カウントが0になり解放される。

また、仮に必要な `Value` への `marked()` を忘れて `garbageCollector.sweep()` してしまった場合には、
プログラムには、値が急に空配列になってしまったように見える。
不正なポインタが発生しないため、安全さを保つことができる。

このように参照カウントとガベージコレクションがいい感じに調和できる。

## 動的な値とガベージコレクションのコード

https://github.com/htsnul/seqalt/blob/main/cpp/value.hpp
https://github.com/htsnul/seqalt/blob/main/cpp/value.cpp

## プログラミング言語実装部分のJS版との比較

JS版：
https://github.com/htsnul/seqalt/blob/main/seqalt.js

C++版：
https://github.com/htsnul/seqalt/blob/main/cpp/seqalt.cpp

動的な値の仕組みを使うことで、
JSコードをほぼそのまま一対一対応でC++コードに置き換えることができているのが分かる。

## まとめ

C++の機能を活用し、簡単な動的な値の仕組みと簡単なガベージコレクションを作れた。
これを利用することで、JSとほぼ同じ実装で簡単なプログラミング言語が実装できた。

