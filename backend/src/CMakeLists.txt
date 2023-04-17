set(PENEFILES_SRC 
    main.cpp
    controllers/PenefilesController.cpp
    db/PenefilesDb.cpp
    services/PenefilesService.cpp)

find_package(oatpp 1.3.0 REQUIRED)
find_package(oatpp-sqlite 1.3.0 REQUIRED)
find_package(SQLite3 REQUIRED)

add_executable(penefiles ${PENEFILES_SRC})

target_link_libraries(penefiles PUBLIC 
    oatpp::oatpp 
    oatpp::oatpp-sqlite
    uuid)

target_include_directories(penefiles PUBLIC 
    ${PROJECT_SOURCE_DIR}/include)

