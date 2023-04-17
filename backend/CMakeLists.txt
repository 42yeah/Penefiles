cmake_minimum_required(VERSION 3.26.0)

project(penefiles)

set(CMAKE_CXX_STANDARD 17)

add_subdirectory(deps)
add_subdirectory(src)
add_subdirectory(sql)

