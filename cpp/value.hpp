#include <memory>
#include <string>
#include <string_view>
#include <variant>

struct DynamicValue;

struct Value {
  using Null = std::nullptr_t;
  using NativeFunction = Value (*)(Value env, Value l, Value rExpr);
  using Body = std::variant<Null, double, NativeFunction, std::shared_ptr<DynamicValue>>;
  Body body;
  static Value fromBool(bool v) { return Value(v ? 1.0 : 0.0); }
  Value() {}
  Value(Body body) { this->body = body; }
  Value(std::string_view str);
  Value(std::initializer_list<Value> l);
  Value(std::initializer_list<std::pair<const std::string, Value>> l);
  Value& operator=(Body body) { this->body = body; return *this; }
  Value shallowCopy();
  bool operator==(Value v);
  bool operator!=(Value v) { return !(*this == v); }
  bool operator<(Value v);
  bool operator<=(Value v) { return !(*this > v); }
  bool operator>(Value v) { return *this != v && !(*this < v); }
  bool operator>=(Value v) { return !(*this < v); }
  Value operator+(Value v);
  bool isNull() { return std::holds_alternative<std::nullptr_t>(body); }
  double* asNumber() { return std::get_if<double>(&body); }
  NativeFunction* asNativeFunction() { return std::get_if<NativeFunction>(&body); }
  std::shared_ptr<DynamicValue>* asDynamicValue() { return std::get_if<std::shared_ptr<DynamicValue>>(&body); }
  double toNumber();
  bool toBool();
  std::string* asString();
  std::string toString();
  Value& operator[](Value v);
  size_t length();
  size_t push(Value v);
  Value& operator[](size_t i);
  bool has(std::string_view s);
  Value& operator[](std::string_view s);
};
