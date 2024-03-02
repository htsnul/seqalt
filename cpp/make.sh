#!/bin/bash

get_sample() {
  local title=$1
  awk \
    '/^####/ { i = 0; }; i { print $0; }; /^#### '"$title"' ####/ { i = 1; }' \
    ../samples.txt
}

build() {
  clang++ -std=c++20 main.cpp seqalt.cpp value.cpp
}

run() {
  get_sample "Hello World" | ./a.out
  get_sample "Arithmetic" | ./a.out
  get_sample "Conditions" | ./a.out
  get_sample "Variable" | ./a.out
  get_sample "User function" | ./a.out
  get_sample "Array" | ./a.out
  get_sample "Fibonacci" | ./a.out
  get_sample "Variable scoping" | ./a.out
  get_sample "Closure" | ./a.out
  #get_sample "Class" | ./a.out
  get_sample "Comment" | ./a.out
}

format() {
  ~/llvm/bin/clang-format -i seqalt.cpp
}

build_and_run (){
  build && run
}

$1
