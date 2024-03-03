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
  static void sweep();
  static Value makeNumber(double n) { return Value(n); }
  static Value makeNativeFunction(NativeFunction f) { return Value(f); }
  static Value makeDic(std::initializer_list<std::pair<const std::string, Value>> l) {
    return Value(l);
  }
  static Value fromBool(bool v) { return Value(v ? 1.0 : 0.0); }
  Value() {}
  Value(double v) { body = v; }
  Value(int v) : Value(double(v)) {}
  Value(size_t v) : Value(double(v)) {}
  Value(bool v) : Value(double(v)) {}
  Value(NativeFunction f) { body = f; }
  Value(std::shared_ptr<DynamicValue> v) { body = v; }
  Value(const std::string& str);
  Value(std::string_view str) : Value(std::string(str)) {}
  Value(const char* str) : Value(std::string(str)) {}
  Value(std::initializer_list<Value> l);
  Value(std::initializer_list<std::pair<const std::string, Value>> l);
  Value shallowCopy();
  bool isNull() { return std::holds_alternative<std::nullptr_t>(body); }
  double* asNumber() { return std::get_if<double>(&body); }
  NativeFunction* asNativeFunction() { return std::get_if<NativeFunction>(&body); }
  std::shared_ptr<DynamicValue>* asDynamicValue() { return std::get_if<std::shared_ptr<DynamicValue>>(&body); }
  double toNumber();
  bool toBool();
  explicit operator bool() { return toBool(); }
  std::string* asString();
  std::string toString();
  Value& operator[](Value v);
  size_t length();
  size_t push(Value v);
  Value* find(std::string_view s);
  void mark();
};

Value operator==(Value v0, Value v1);
Value operator<(Value v0, Value v1);
Value operator+(Value v0, Value v1);

inline Value operator!=(Value v0, Value v1) { return Value::fromBool(!(v0 == v1)); }
inline Value operator>(Value v0, Value v1) { return Value::fromBool(v0 != v1 && !(v0 < v1)); }
inline Value operator<=(Value v0, Value v1) { return Value::fromBool(!(v0 > v1)); }
inline Value operator>=(Value v0, Value v1) { return Value::fromBool(!(v0 < v1)); }
