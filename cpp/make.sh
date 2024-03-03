#!/bin/bash

get_sample() {
  local title=$1
  awk \
    '/^####/ { i = 0; }; i { print $0; }; /^#### '"$title"' ####/ { i = 1; }' \
    ../samples.txt
}

run_sample() {
  local title=$1
  printf '## %s\n' "$title"
  get_sample "$1" | ./a.out
}

build() {
  clang++ -std=c++20 main.cpp seqalt.cpp value.cpp
}

run() {
  run_sample "Hello World"
  run_sample "Arithmetic"
  run_sample "Conditions"
  run_sample "Variable"
  run_sample "User function"
  run_sample "Array"
  run_sample "Fibonacci"
  run_sample "Variable scoping"
  run_sample "Closure"
  #run_sample "Class"
  run_sample "Comment"
}

format() {
  ~/llvm/bin/clang-format -i seqalt.cpp
}

build_and_run (){
  build && run
}

$1
