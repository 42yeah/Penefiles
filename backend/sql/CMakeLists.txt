set(SQL_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR})
set(DEST_DIR ${CMAKE_CURRENT_BINARY_DIR})

if(EXISTS ${DEST_DIR}/penefiles.sqlite3)
  message("${DEST_DIR}/penefiles.sqlite3 is already here. We didn't update the database because we are afraid we may wipe it. Manually delete the file if you want us to update it.")
else()
  add_custom_target(
    sql ALL
    COMMAND ${CMAKE_COMMAND} -E make_directory ${DEST_DIR}
    COMMAND ${CMAKE_COMMAND} -E copy ${SQL_SOURCE_DIR}/penefiles.sqlite3 ${DEST_DIR}
    COMMENT "Deploying PENEfiles database..."
  )
endif()
