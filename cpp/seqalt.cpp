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

struct Value;

struct GarbageCollector {
  std::forward_list<Value *> values;
} garbageCollector;

struct Value {
  using Array = std::vector<Value *>;
  using Dic = std::unordered_map<std::string, Value *>;
  using NativeFunction = Value *(*)(Value *env, Value *l, Value *rExr);
  using Body =
      std::variant<std::nullptr_t, double, std::unique_ptr<std::string>,
                   std::unique_ptr<Array>, std::unique_ptr<Dic>,
                   NativeFunction>;
  Body body;
  static Value *createNull() { return new Value(); }
  static Value *createNumber(double num) { return new Value(num); }
  static Value *createString(std::string_view str) {
    return new Value(std::make_unique<std::string>(str));
  }
  static Value *createDic(std::initializer_list<Dic::value_type> list) {
    return new Value(std::make_unique<Dic>(list));
  }
  Value() { garbageCollector.values.push_front(this); }
  Value(Body &&body) : Value() { this->body = std::move(body); }
  double &asNumber() { return std::get<double>(body); }
  std::string &asString() {
    return *std::get<std::unique_ptr<std::string>>(body);
  }
  Array &asArray() { return *std::get<std::unique_ptr<Array>>(body); }
  Dic &asDic() { return *std::get<std::unique_ptr<Dic>>(body); }
  NativeFunction asNativeFunction() { return std::get<NativeFunction>(body); }
  std::string toString() {
    if (std::holds_alternative<std::nullptr_t>(body)) {
      return "null";
    }
    if (std::holds_alternative<double>(body)) {
      return std::to_string(std::get<double>(body));
    }
    if (std::holds_alternative<std::unique_ptr<std::string>>(body)) {
      return *std::get<std::unique_ptr<std::string>>(body);
    }
    if (std::holds_alternative<std::unique_ptr<Array>>(body)) {
      const auto &array = *std::get<std::unique_ptr<Array>>(body);
      std::string s{};
      size_t i{0};
      s += "[";
      for (auto &e : array) {
        s += e->toString() + (i != array.size() - 1 ? "," : "");
        ++i;
      }
      s += "]";
      return s;
    }
    if (std::holds_alternative<std::unique_ptr<Dic>>(body)) {
      const auto &dic = *std::get<std::unique_ptr<Dic>>(body);
      std::string s{};
      size_t i{0};
      s += "{";
      for (auto &[k, v] : dic) {
        s += k + ":" + v->toString() + (i != dic.size() - 1 ? "," : "");
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

std::pair<size_t, Value *> parseSequence(const std::vector<Token> &tokens,
                                         size_t i, std::string subtype = "(");

std::pair<size_t, Value *> parseExpr(const std::vector<Token> &tokens,
                                     size_t i) {
  const auto &token = tokens.at(i);
  if (token.type == Token::Type::SequenceStart) {
    auto result = parseSequence(tokens, i + 1, token.string);
    assert(tokens[result.first].type == Token::Type::SequenceEnd);
    return {result.first + 1, result.second};
  }
  if (token.type == Token::Type::Number) {
    double num{};
    std::from_chars(token.string.data(),
                    token.string.data() + token.string.size(), num);
    return {i + 1, Value::createDic({{"type", Value::createString("Number")},
                                     {"value", Value::createNumber(num)}})};
  }
  if (token.type == Token::Type::String) {
    return {i + 1,
            Value::createDic({{"type", Value::createString("String")},
                              {"value", Value::createString(token.string)}})};
  }
  if (token.type == Token::Type::Symbol) {
    return {i + 1,
            Value::createDic({{"type", Value::createString("Symbol")},
                              {"value", Value::createString(token.string)}})};
  }
}

std::pair<size_t, Value *> parseSequence(const std::vector<Token> &tokens,
                                         size_t i, std::string subtype) {
  Value *exprs = new Value(std::make_unique<Value::Array>());
  while (i < tokens.size() && tokens.at(i).type != Token::Type::SequenceEnd) {
    const auto result = parseExpr(tokens, i);
    i = result.first;
    exprs->asArray().push_back(result.second);
  }
  return {i, Value::createDic({{"type", Value::createString("Sequence")},
                               {"subtype", Value::createString(subtype)},
                               {"exprs", exprs}})};
}

Value *parse(const std::vector<Token> &tokens) {
  return parseSequence(tokens, 0).second;
}

//function callUserFunc(func, l, r) {
//  const env = { __parentEnv: func.env, args: { l, r } };
//  if (Array.isArray(r)) func.argNames.forEach((name, i) => env[name] = r[i]);
//  else env[func.argNames[0]] = r;
//  const val = evalExpr(env, func.expr);
//  return val;
//}

Value *callFunc(Value *env, Value *func, Value *l, Value *rExpr) {
  if (std::holds_alternative<Value::NativeFunction>(func->body)) {
    return func->asNativeFunction()(env, l, rExpr);
  }
  // if (typeof func === "object") return callUserFunc(func, l, evalExpr(env,
  // rExpr));
}

Value *evalExpr(Value *env, Value *expr);

Value *evalSequenceExpr(Value *env, Value *expr) {
  //  if (expr.exprs.length === 0) return { "[": [], "{": {} }[expr.subtype];
  {}
  Value *val = evalExpr(env, expr->asDic()["exprs"]->asArray().at(0));
  //  if (expr.subtype === "[") val = [val];
  {}
  for (size_t i = 1; i < expr->asDic()["exprs"]->asArray().size();) {
    auto *func = evalExpr(env, expr->asDic()["exprs"]->asArray().at(i++));
    auto *rExpr =
        i < expr->asDic()["exprs"]->asArray().size()
            ? expr->asDic()["exprs"]->asArray().at(i++)
            : Value::createDic({{"type", Value::createString("Null")}});
    val = callFunc(env, func, val, rExpr);
  }
  //  if (expr.subtype === "{" && val?.__type === "DicUnderConstruction") val =
  //  val.body;
  return val;
}

Value *envVal(Value *env, std::string_view name);

Value *evalExpr(Value *env, Value *expr) {
  if (expr->asDic()["type"]->asString() == "Sequence") {
    return evalSequenceExpr(env, expr);
  }
  if (expr->asDic()["type"]->asString() == "Number") {
    return Value::createNumber(expr->asDic()["value"]->asNumber());
  }
  if (expr->asDic()["type"]->asString() == "String") {
    return Value::createString(expr->asDic()["value"]->asString());
  }
  if (expr->asDic()["type"]->asString() == "Symbol") {
    return envVal(env, expr->asDic()["value"]->asString());
  }
  return new Value();
}

// function ownerEnv(env, name) {
//   return (!env || name in env) ? env : ownerEnv(env.__parentEnv, name);
// }
//
// function envVal(env, name) { return ownerEnv(env, name)[name]; }
Value *envVal(Value *env, std::string_view name) {
  // return ownerEnv(env, name)[name]; }
  return env->asDic()[std::string(name)];
}

Value *createRootEnv() {
  Value *rootEnv = new Value(std::make_unique<Value::Dic>());
  rootEnv->asDic().emplace("@", new Value());
  rootEnv->asDic().emplace(";",
                           new Value([](Value *env, Value *l, Value *rExpr) {
                             return evalExpr(env, rExpr);
                           }));
  rootEnv->asDic().emplace(
      "+", new Value([](Value *env, Value *l, Value *rExpr) {
        return Value::createNumber(l->asNumber() +
                                   evalExpr(env, rExpr)->asNumber());
      }));
  rootEnv->asDic().emplace(
      "-", new Value([](Value *env, Value *l, Value *rExpr) {
        return Value::createNumber(l->asNumber() -
                                   evalExpr(env, rExpr)->asNumber());
      }));
  rootEnv->asDic().emplace(
      "*", new Value([](Value *env, Value *l, Value *rExpr) {
        return Value::createNumber(l->asNumber() *
                                   evalExpr(env, rExpr)->asNumber());
      }));
  rootEnv->asDic().emplace(
      "print", new Value([](Value *env, Value *l, Value *rExpr) {
        std::cout << evalExpr(env, rExpr)->toString() << std::endl;
        return new Value();
      }));
  return rootEnv;
}

int main() {
  const auto tokens = tokenize(getStdinString());
  //const auto tokens = tokenize("@print(15+3)");
  // const auto tokens = tokenize("0 print \"hello\"");
  const auto expr = parse(tokens);
  const auto val = evalExpr(createRootEnv(), expr);
  std::cout << val->toString() << std::endl;
  return 0;
}
