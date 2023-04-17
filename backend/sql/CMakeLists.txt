set(SQL_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR})
set(DEST_DIR ${CMAKE_CURRENT_BINARY_DIR})

add_custom_target(
    sql ALL
    COMMAND ${CMAKE_COMMAND} -E make_directory ${DEST_DIR}
    COMMAND ${CMAKE_COMMAND} -E copy ${SQL_SOURCE_DIR}/penefiles.sqlite3 ${DEST_DIR}
    COMMENT "Deploying PENEfiles database..."
)
