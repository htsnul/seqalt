#include <cassert>
#include <iostream>
#include <regex>
#include <string>
#include <string_view>
#include "value.hpp"

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
        {"type", Value("Number")},
        {"value", Value(num)}
      }))
    };
  }
  if (token.type == Token::Type::String) {
    return {
      i + 1,
      Value(new DynamicValue({
        {"type", Value("String")},
        {"value", Value(token.string)}
      }))
    };
  }
  if (token.type == Token::Type::Symbol) {
    return {
      i + 1,
      Value(new DynamicValue({
        {"type", Value("Symbol")},
        {"value", Value(token.string)}
      }))
    };
  }
  return {i, Value()};
}

std::pair<size_t, Value> parseSequence(
  const std::vector<Token> &tokens, size_t i, std::string subtype
) {
  Value exprs(new DynamicValue(Array()));
  while (i < tokens.size() && tokens.at(i).type != Token::Type::SequenceEnd) {
    const auto result = parseExpr(tokens, i);
    i = result.first;
    (*exprs.asDynamicValue())->asArray().push_back(Value(result.second));
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
  if (auto* nativeFunc = func.asNativeFunction()) {
    return (*nativeFunc)(env, l, rExpr);
  }
  // if (typeof func === "object") return callUserFunc(func, l, evalExpr(env,
  // rExpr));
  return {};
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
      : Value(new DynamicValue({{"type", Value("Null")}}))
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
  rootEnv[";"] = Value([](Value env, Value l, Value rExpr) {
    return evalExpr(env, rExpr);
  });
  rootEnv["+"] = Value([](Value env, Value l, Value rExpr) {
    return Value(l.toNumber() + evalExpr(env, rExpr).toNumber());
  });
  rootEnv["-"] = Value([](Value env, Value l, Value rExpr) {
    return Value(l.toNumber() - evalExpr(env, rExpr).toNumber());
  });
  rootEnv["*"] = Value([](Value env, Value l, Value rExpr) {
    return Value(l.toNumber() * evalExpr(env, rExpr).toNumber());
  });
  //rootEnv["var"] = (env, l, rExpr) => {
  //  const name = evalExpr(env, rExpr);
  //  env[name] = null;
  //  return name;
  //};
  //rootEnv["="] = (env, l, rExpr) => {
  rootEnv["="] = Value([](Value env, Value l, Value rExpr) {
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
  rootEnv["print"] = Value([](Value env, Value l, Value rExpr) {
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
