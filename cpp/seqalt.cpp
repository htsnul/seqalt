#include <cassert>
#include <charconv>
#include <forward_list>
#include <iostream>
#include <regex>
#include <string>
#include <string_view>
#include <unordered_map>
#include <variant>
#include <vector>

using namespace std::literals;

std::string getStdinString() {
  std::string str;
  std::string line;
  while (std::getline(std::cin, line))
    str += line + "\n";
  return str;
}

struct Token {
  enum class Type {
    SequenceStart,
    SequenceEnd,
    Number,
    String,
    Symbol,
  };
  Type type;
  std::string string;
};

auto tokenize(std::string_view str) {
  std::vector<Token> tokens;
  for (size_t i = 0; i < str.length();) {
    std::cmatch m;
    if (str[i] == '(' || str[i] == '{' || str[i] == '[') {
      tokens.push_back(
          Token{Token::Type::SequenceStart, std::string(1, str[i++])});
    } else if (str[i] == ')' || str[i] == '}' || str[i] == ']') {
      tokens.push_back(
          Token{Token::Type::SequenceEnd, std::string(1, str[i++])});
    } else if (std::regex_search(str.begin() + i, str.end(), m,
                                 std::regex("^\\d+"))) {
      tokens.push_back(Token{Token::Type::Number, m[0]});
      i += m.length(0);
    } else if (std::regex_search(str.begin() + i, str.end(), m,
                                 std::regex(R"""(^"((\\.|[^"])*)")"""))) {
      tokens.push_back(Token{
          Token::Type::String,
          std::regex_replace(std::string(m[1]), std::regex("\\\\(.)"), "$1")});
      i += m.length(0);
    } else if (std::regex_search(
                   str.begin() + i, str.end(), m,
                   std::regex(R"""(^[A-Za-z_]\w*|^[!#-'*-/:-@^`|~]+)"""))) {
      tokens.push_back(Token{Token::Type::Symbol, m[0]});
      i += m.length(0);
    } else
      ++i;
  }
  return tokens;
}

struct DynamicValue;

struct GarbageCollector {
  std::forward_list<DynamicValue *> values;
} garbageCollector;

struct Value;

using Array = std::vector<Value>;
using Dic = std::unordered_map<std::string, Value>;
using NativeFunction = Value (*)(Value env, Value l, Value rExr);

struct Value {
  using Body = std::variant<DynamicValue*>;
  Body body;
  inline Value();
  Value(const Body& body) { this->body = body; }
  Value& operator=(const Body& body) { this->body = body; return *this; }
  DynamicValue*& asDynamicValue() { return std::get<DynamicValue*>(body); }
  inline double toNumber();
  inline std::string toString();
  inline operator std::string_view();
  inline size_t length();
  inline Value& operator[](size_t i);
  inline Value& operator[](std::string_view s);
};

struct DynamicValue {
  using Body = std::variant<
    std::nullptr_t,
    double,
    std::string,
    Array,
    Dic,
    NativeFunction
  >;
  Body body;
  DynamicValue() { garbageCollector.values.push_front(this); }
  DynamicValue(const DynamicValue& val) : DynamicValue(val.body) {}
  DynamicValue(const Body& body) : DynamicValue() { this->body = body; }
  DynamicValue(std::initializer_list<Dic::value_type> list) : DynamicValue(Dic(list)) {}
  operator std::string_view() { return std::get<std::string>(body); }
  Array &asArray() { return std::get<Array>(body); }
  Dic &asDic() { return std::get<Dic>(body); }
  Value& operator[](std::string_view str) {
    return asDic()[std::string(str)];
  }
  Value& operator[](size_t i) { return asArray().at(i); }
  size_t length() { return asArray().size(); }
  NativeFunction asNativeFunction() { return std::get<NativeFunction>(body); }
  double toNumber() {
    if (auto* num = std::get_if<double>(&body)) return *num;
    return 0.0;
  }
  std::string toString() {
    if (std::holds_alternative<std::nullptr_t>(body)) {
      return "null";
    }
    if (std::holds_alternative<double>(body)) {
      return std::to_string(std::get<double>(body));
    }
    if (std::holds_alternative<std::string>(body)) {
      return std::get<std::string>(body);
    }
    if (std::holds_alternative<Array>(body)) {
      auto &array = std::get<Array>(body);
      std::string s{};
      size_t i{0};
      s += "[";
      for (auto &e : array) {
        s += e.toString() + (i != array.size() - 1 ? "," : "");
        ++i;
      }
      s += "]";
      return s;
    }
    if (std::holds_alternative<Dic>(body)) {
      auto &dic = std::get<Dic>(body);
      std::string s{};
      size_t i{0};
      s += "{";
      for (auto &[k, v] : dic) {
        s += k + ":" + v.toString() + (i != dic.size() - 1 ? "," : "");
        ++i;
      }
      s += "}";
      return s;
    }
    if (std::holds_alternative<NativeFunction>(body)) {
      return "NativeFunction";
    }
    return {};
  }
};

Value::Value() : Value(new DynamicValue()) {}
Value::operator std::string_view() { return *asDynamicValue(); }
size_t Value::length() { return (*asDynamicValue()).length(); }
Value& Value::operator[](size_t i) { return (*asDynamicValue())[i]; }
Value& Value::operator[](std::string_view s) { return (*asDynamicValue())[s]; }
double Value::toNumber() { return asDynamicValue()->toNumber(); }
std::string Value::toString() { return asDynamicValue()->toString(); }

std::pair<size_t, Value> parseSequence(
  const std::vector<Token> &tokens, size_t i, std::string subtype = "("
);

std::pair<size_t, Value> parseExpr(
  const std::vector<Token> &tokens, size_t i
) {
  const auto &token = tokens.at(i);
  if (token.type == Token::Type::SequenceStart) {
    auto result = parseSequence(tokens, i + 1, token.string);
    assert(tokens[result.first].type == Token::Type::SequenceEnd);
    return {result.first + 1, result.second};
  }
  if (token.type == Token::Type::Number) {
    double num{};
    std::from_chars(
      token.string.data(),
      token.string.data() + token.string.size(), num
    );
    return {
      i + 1,
      Value(new DynamicValue({
        {"type", Value(new DynamicValue("Number"))},
        {"value", Value(new DynamicValue(num))}
      }))
    };
  }
  if (token.type == Token::Type::String) {
    return {
      i + 1,
      Value(new DynamicValue({
        {"type", Value(new DynamicValue("String"))},
        {"value", Value(new DynamicValue(token.string))}
      }))
    };
  }
  if (token.type == Token::Type::Symbol) {
    return {
      i + 1,
      Value(new DynamicValue({
        {"type", Value(new DynamicValue("Symbol"))},
        {"value", Value(new DynamicValue(token.string))}
      }))
    };
  }
}

std::pair<size_t, Value> parseSequence(
  const std::vector<Token> &tokens, size_t i, std::string subtype
) {
  Value exprs(new DynamicValue(Array()));
  while (i < tokens.size() && tokens.at(i).type != Token::Type::SequenceEnd) {
    const auto result = parseExpr(tokens, i);
    i = result.first;
    exprs.asDynamicValue()->asArray().push_back(Value(result.second));
  }
  return {
    i,
    Value(new DynamicValue({
      {"type", Value(new DynamicValue("Sequence"))},
      {"subtype", Value(new DynamicValue(subtype))},
      {"exprs", exprs}
    }))
  };
}

Value parse(const std::vector<Token> &tokens) {
  return parseSequence(tokens, 0).second;
}

//function callUserFunc(func, l, r) {
//  const env = { __parentEnv: func.env, args: { l, r } };
//  if (Array.isArray(r)) func.argNames.forEach((name, i) => env[name] = r[i]);
//  else env[func.argNames[0]] = r;
//  const val = evalExpr(env, func.expr);
//  return val;
//}

Value callFunc(Value env, Value func, Value l, Value rExpr) {
  if (std::holds_alternative<NativeFunction>(func.asDynamicValue()->body)) {
    return func.asDynamicValue()->asNativeFunction()(env, l, rExpr);
  }
  // if (typeof func === "object") return callUserFunc(func, l, evalExpr(env,
  // rExpr));
}

Value evalExpr(Value env, Value expr);

Value evalSequenceExpr(Value env, Value expr) {
  //  if (expr.exprs.length === 0) return { "[": [], "{": {} }[expr.subtype];
  {}
  Value val = evalExpr(env, expr["exprs"][0]);
  //  if (expr.subtype === "[") val = [val];
  {}
  for (size_t i = 1; i < expr["exprs"].length();) {
    auto func = evalExpr(env, expr["exprs"][i++]);
    auto rExpr = (
      i < expr["exprs"].length()
      ? expr["exprs"][i++]
      : Value(new DynamicValue({{"type", Value(new DynamicValue("Null"))}}))
    );
    val = callFunc(env, func, val, rExpr);
  }
  //  if (expr.subtype === "{" && val?.__type === "DicUnderConstruction") val =
  //  val.body;
  return val;
}

Value envVal(Value env, std::string_view name);

Value evalExpr(Value env, Value expr) {
  if (expr["type"] == "Sequence"sv) return evalSequenceExpr(env, expr);
  if (expr["type"] == "Number"sv) return expr["value"];
  if (expr["type"] == "String"sv) return expr["value"];
  if (expr["type"] == "Symbol"sv) return envVal(env, expr["value"]);
  return {};
}

Value ownerEnv(Value env, std::string_view name) {
  return env;
  //   return (!env || name in env) ? env : ownerEnv(env.__parentEnv, name);
}

Value envVal(Value env, std::string_view name) {
  return ownerEnv(env, name)[name];
}

Value createRootEnv() {
  Value rootEnv(new DynamicValue(Dic()));
  rootEnv["@"] = new DynamicValue();
  rootEnv[";"] = new DynamicValue([](Value env, Value l, Value rExpr) {
    return evalExpr(env, rExpr);
  });
  rootEnv["+"] = new DynamicValue([](Value env, Value l, Value rExpr) {
    return Value(new DynamicValue(l.toNumber() + evalExpr(env, rExpr).toNumber()));
  });
  rootEnv["-"] = new DynamicValue([](Value env, Value l, Value rExpr) {
    return Value(new DynamicValue(l.toNumber() - evalExpr(env, rExpr).toNumber()));
  });
  rootEnv["*"] = new DynamicValue([](Value env, Value l, Value rExpr) {
    return Value(new DynamicValue(l.toNumber() * evalExpr(env, rExpr).toNumber()));
  });
  //rootEnv["var"] = (env, l, rExpr) => {
  //  const name = evalExpr(env, rExpr);
  //  env[name] = null;
  //  return name;
  //};
  //rootEnv["="] = (env, l, rExpr) => {
  rootEnv["="] = new DynamicValue([](Value env, Value l, Value rExpr) {
    //  if (Array.isArray(l) && l.length === 2) {
    //    const [obj, key] = l;
    //    return obj[key] = evalExpr(env, rExpr);
    //  }
    //  const name = l;
    auto name = l.toString();
    // TODO: rootenv
    auto e = ownerEnv(env, name);
    return e[name] = evalExpr(env, rExpr);
  });
  rootEnv["print"] = new DynamicValue([](Value env, Value l, Value rExpr) {
    std::cout << evalExpr(env, rExpr).toString() << std::endl;
    return Value{};
  });
  return rootEnv;
}

int main() {
  const auto tokens = tokenize(getStdinString());
  //const auto tokens = tokenize("\"a\"=3; @print(a)");
  //const auto tokens = tokenize("0+1");
  // const auto tokens = tokenize("0 print \"hello\"");
  auto expr = Value(parse(tokens));
  auto val = evalExpr(createRootEnv(), expr);
  std::cout << val.toString() << std::endl;
  return 0;
}
