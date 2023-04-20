set(PENEFILES_SRC 
    main.cpp
    controllers/PenefilesController.cpp
    db/PenefilesDb.cpp
    services/PenefilesService.cpp)

find_package(oatpp 1.3.0 REQUIRED)
find_package(oatpp-sqlite 1.3.0 REQUIRED)
find_package(Threads REQUIRED)

if(NOT DONT_LINK_SQLITE)
    find_package(SQLite3)
endif()

add_executable(penefiles ${PENEFILES_SRC})

target_link_libraries(penefiles PUBLIC 
    oatpp::oatpp 
    oatpp::oatpp-sqlite
    Threads::Threads
    uuid)

if(USE_EXPERIMENTAL_FILESYSTEM)
    target_compile_definitions(penefiles PRIVATE USE_EXPERIMENTAL_FILESYSTEM)
    target_link_libraries(penefiles PUBLIC stdc++fs)
endif()

target_include_directories(penefiles PUBLIC 
    ${PROJECT_SOURCE_DIR}/include)
