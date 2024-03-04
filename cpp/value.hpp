#include <memory>
#include <string>
#include <string_view>
#include <variant>

struct DynamicValue;

struct Value {
  using Null = std::nullptr_t;
  using NativeFunc = Value (*)(Value env, Value l, Value rExpr);
  using DynamicValuePtr = std::shared_ptr<DynamicValue>;
  using Body = std::variant<Null, double, NativeFunc, DynamicValuePtr>;
  Body body;
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
  Value shallowCopy();
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
  std::string toJSONString();
  void mark();
  static void sweep();
};

bool operator==(Value v0, Value v1);
Value operator+(Value v0, Value v1);

inline bool operator<(Value v0, Value v1) { return double(v0) < double(v1); }
inline bool operator!=(Value v0, Value v1) { return !(v0 == v1); }
inline bool operator>(Value v0, Value v1) { return v0 != v1 && !(v0 < v1); }
inline bool operator<=(Value v0, Value v1) { return !(v0 > v1); }
inline bool operator>=(Value v0, Value v1) { return !(v0 < v1); }
