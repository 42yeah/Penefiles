cmake_minimum_required(VERSION 3.10.0)

project(penefiles)

set(CMAKE_CXX_STANDARD 17)

# Set this option to ON to use std::experimental::filesystem instead of std::filesystem.
option(USE_EXPERIMENTAL_FILESYSTEM OFF)
# Set this to ON if you already have oatpp and oatpp-sqlite installed on your system.
option(USE_EXISTING_OATPP OFF)
# If Oat++ is compield using SQLite amalgamation, then specify this option.
option(DONT_LINK_SQLITE OFF)

add_subdirectory(deps)
add_subdirectory(src)
add_subdirectory(sql)

set(FRONTEND_DEST_DIR ${CMAKE_BINARY_DIR})
add_custom_target(frontend ALL
  COMMAND ${CMAKE_COMMAND} -E copy_directory ${CMAKE_CURRENT_LIST_DIR}/../frontend ${FRONTEND_DEST_DIR}/frontend
  COMMENT "Deploying frontend...")
